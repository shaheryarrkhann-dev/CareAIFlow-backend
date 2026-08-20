const prisma = require("../../lib/prisma");

/**
 * Create dynamic table for tenant form data if it doesn't exist
 */
async function ensureFormDataTable(tenantId, formId, schemaFields) {
  const tableName = `tenant_${tenantId.replace(
    /-/g,
    "_"
  )}_form_${formId.replace(/-/g, "_")}`;

  // Check if table exists
  const tableExists = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = '${tableName}'
    );
  `);

  if (tableExists[0].exists) {
    // Table exists - check for missing columns and add them
    const existingColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = '${tableName}'
    `);

    const existingColumnNames = new Set(
      existingColumns.map((col) => col.column_name.toLowerCase())
    );

    // Find missing columns from schema
    const missingColumns = schemaFields.filter((field) => {
      const colName = field.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
      return !existingColumnNames.has(colName);
    });

    // Add missing columns
    if (missingColumns.length > 0) {
      console.log(
        `[FormData] Adding ${missingColumns.length} missing column(s) to existing table ${tableName}`
      );

      for (const field of missingColumns) {
        const colName = field.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        let colType = "TEXT";

        switch (field.type) {
          case "number":
            colType = "NUMERIC";
            break;
          case "date":
            colType = "DATE";
            break;
          case "checkbox":
            colType = "BOOLEAN";
            break;
          case "email":
          case "text":
          case "textarea":
          case "dropdown":
          default:
            colType = "TEXT";
        }

        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${colName}" ${colType}`
          );
          console.log(
            `[FormData] ✅ Added column "${colName}" (${colType}) to table ${tableName}`
          );
        } catch (error) {
          console.error(
            `[FormData] ⚠️ Failed to add column "${colName}" to table ${tableName}:`,
            error.message
          );
          // Continue with other columns even if one fails
        }
      }
    }

    return tableName;
  }

  // Build column definitions from schema
  const columnDefs = schemaFields
    .map((field) => {
      const colName = field.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
      let colType = "TEXT";

      switch (field.type) {
        case "number":
          colType = "NUMERIC";
          break;
        case "date":
          colType = "DATE";
          break;
        case "checkbox":
          colType = "BOOLEAN";
          break;
        case "email":
        case "text":
        case "textarea":
        case "dropdown":
        default:
          colType = "TEXT";
      }

      return `"${colName}" ${colType}`;
    })
    .join(",\n    ");

  // Create table with tenant isolation columns (split into separate statements)
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      "id" TEXT PRIMARY KEY,
      "tenant_id" TEXT NOT NULL,
      "user_id" TEXT NOT NULL,
      "form_id" TEXT NOT NULL,
      ${columnDefs},
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Execute statements separately to avoid "multiple commands" error
  await prisma.$executeRawUnsafe(createTableSQL);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "${tableName}_tenant_id_idx" ON "${tableName}"("tenant_id")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "${tableName}_user_id_idx" ON "${tableName}"("user_id")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "${tableName}_form_id_idx" ON "${tableName}"("form_id")`
  );

  return tableName;
}

/**
 * Insert form submission data into dynamic tenant table
 */
async function saveFormSubmission({
  tenantId,
  userId,
  formId,
  schema,
  formData,
}) {
  const tableName = await ensureFormDataTable(tenantId, formId, schema.fields);

  // Build column names and values
  const { nanoid } = require("nanoid");
  const id = nanoid();
  const now = new Date();

  const columns = [
    "id",
    "tenant_id",
    "user_id",
    "form_id",
    "created_at",
    "updated_at",
  ];
  const values = [id, tenantId, userId, formId, now, now];

  // Add schema fields with type validation
  schema.fields.forEach((field) => {
    const colName = field.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    let value = formData[field.name];

    if (value !== undefined && value !== null) {
      // Additional type validation before inserting
      // Ensure boolean fields are actually booleans
      if (field.type === "checkbox" || field.type === "boolean") {
        // If it's a string, try to convert it
        if (typeof value === "string") {
          const lowerValue = value.toLowerCase().trim();
          if (
            lowerValue === "true" ||
            lowerValue === "yes" ||
            lowerValue === "1" ||
            lowerValue === "checked"
          ) {
            value = true;
          } else if (
            lowerValue === "false" ||
            lowerValue === "no" ||
            lowerValue === "0" ||
            lowerValue === "unchecked"
          ) {
            value = false;
          } else if (value.length > 50) {
            // Long text string for boolean field - skip it
            console.warn(
              `[FormData] Field "${
                field.name
              }" is boolean but got long text string, skipping: ${value.substring(
                0,
                50
              )}...`
            );
            return; // Skip this field
          } else {
            // Unknown value - default to false
            console.warn(
              `[FormData] Field "${field.name}" is boolean but got unrecognized value: "${value}", defaulting to false`
            );
            value = false;
          }
        }
        // Ensure it's a boolean
        if (typeof value !== "boolean") {
          value = Boolean(value);
        }
      }

      columns.push(`"${colName}"`);
      values.push(value);
    }
  });

  // Build parameterized query with proper type casting
  // Create a map of field names to types
  const fieldTypeMap = {};
  schema.fields.forEach((field) => {
    const colName = field.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    fieldTypeMap[colName] = field.type;
  });

  const placeholders = values
    .map((val, i) => {
      const colName = columns[i].replace(/"/g, "");

      // Apply type casting based on column
      if (colName === "created_at" || colName === "updated_at") {
        return `$${i + 1}::timestamp`;
      }

      // Cast based on field type from schema
      const fieldType = fieldTypeMap[colName];
      if (fieldType === "date") {
        return `$${i + 1}::date`;
      } else if (fieldType === "number") {
        return `$${i + 1}::numeric`;
      } else if (fieldType === "checkbox") {
        return `$${i + 1}::boolean`;
      }

      return `$${i + 1}`;
    })
    .join(", ");
  const columnsList = columns
    .map((c) => (c.includes('"') ? c : `"${c}"`))
    .join(", ");

  const insertSQL = `INSERT INTO "${tableName}" (${columnsList}) VALUES (${placeholders}) RETURNING *`;

  const result = await prisma.$queryRawUnsafe(insertSQL, ...values);

  return {
    id,
    tableName,
    data: result[0],
  };
}

/**
 * Retrieve form submissions for a tenant
 * If tenantId is null, queries across all tenants for the specified form
 */
async function getFormSubmissions({
  tenantId,
  formId,
  userId = null,
  limit = 100,
  offset = 0,
}) {
  // If tenantId is null, query across all tenant tables for this form
  if (!tenantId) {
    const formIdEscaped = formId.replace(/-/g, "_");
    const tablePattern = `tenant_%_form_${formIdEscaped}`;

    // Find all tables matching this form across all tenants
    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE '${tablePattern}'
      ORDER BY table_name
    `);

    if (!tables || tables.length === 0) {
      return { data: [], count: 0, tableName: null, tables: [] };
    }

    // Build UNION query to get data from all tables
    const unionQueries = [];
    const countQueries = [];

    const baseFields = [
      "'id'",
      "'tenant_id'",
      "'user_id'",
      "'form_id'",
      "'created_at'",
      "'updated_at'",
    ].join(", ");

    for (const table of tables) {
      const tableName = table.table_name;
      let whereClause = `WHERE "form_id" = '${formId}'`;

      if (userId) {
        whereClause += ` AND "user_id" = '${userId}'`;
      }

      unionQueries.push(`
        SELECT
          jsonb_build_object(
            'id', t."id",
            'tenant_id', t."tenant_id",
            'user_id', t."user_id",
            'form_id', t."form_id",
            'created_at', t."created_at",
            'updated_at', t."updated_at",
            'formData', to_jsonb(t) - ARRAY[${baseFields}]::text[]
          ) AS data,
          t."created_at" AS created_at,
          '${tableName}' AS source_table
        FROM "${tableName}" AS t
        ${whereClause}
      `);

      countQueries.push(`
        SELECT COUNT(*) as count FROM "${tableName}"
        ${whereClause}
      `);
    }

    // Execute union query for data
    const unionSQL = unionQueries.join(" UNION ALL ");
    const rawData = await prisma.$queryRawUnsafe(`
      SELECT data, source_table
      FROM (
        SELECT data, source_table, created_at
        FROM (${unionSQL}) as all_responses
        ORDER BY created_at DESC
      ) as ordered_responses
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Execute count query
    const countSQL = countQueries.join(" UNION ALL ");
    const countResults = await prisma.$queryRawUnsafe(`
      SELECT SUM(count)::int as total FROM (${countSQL}) as counts
    `);

    return {
      data: rawData.map((row) => {
        const baseData = row.data || {};
        const { formData = {}, ...core } = baseData;
        return {
          ...core,
          ...formData,
          source_table: row.source_table,
        };
      }),
      count: countResults[0]?.total || 0,
      tableName: null, // Multiple tables, so no single tableName
      tables: tables.map((t) => t.table_name),
    };
  }

  // Single tenant query (original logic)
  const tableName = `tenant_${tenantId.replace(
    /-/g,
    "_"
  )}_form_${formId.replace(/-/g, "_")}`;

  // Check if table exists
  const tableExists = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = '${tableName}'
    );
  `);

  if (!tableExists[0].exists) {
    return { data: [], count: 0 };
  }

  // Build WHERE clause
  let whereClause = `WHERE "tenant_id" = '${tenantId}' AND "form_id" = '${formId}'`;
  if (userId) {
    whereClause += ` AND "user_id" = '${userId}'`;
  }

  // Get data
  const data = await prisma.$queryRawUnsafe(`
    SELECT * FROM "${tableName}"
    ${whereClause}
    ORDER BY "created_at" DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Get count
  const countResult = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM "${tableName}"
    ${whereClause}
  `);

  return {
    data,
    count: parseInt(countResult[0].count),
    tableName,
  };
}

/**
 * Retrieve all form submissions across all forms
 * Used when formId is not specified
 */
async function getAllFormSubmissions({
  tenantId = null,
  userId = null,
  limit = 100,
  offset = 0,
}) {
  // Find all dynamic form tables
  let tablePattern = tenantId
    ? `tenant_${tenantId.replace(/-/g, "_")}_form_%`
    : "tenant_%_form_%";

  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE '${tablePattern}'
    ORDER BY table_name
  `);

  if (!tables || tables.length === 0) {
    return { data: [], count: 0, tables: [] };
  }

  // Build UNION query to get data from all tables
  const unionQueries = [];
  const countQueries = [];

  const baseFields = [
    "'id'",
    "'tenant_id'",
    "'user_id'",
    "'form_id'",
    "'created_at'",
    "'updated_at'",
  ].join(", ");

  for (const table of tables) {
    const tableName = table.table_name;
    let whereClause = "WHERE 1=1";

    if (tenantId) {
      whereClause += ` AND "tenant_id" = '${tenantId}'`;
    }
    if (userId) {
      whereClause += ` AND "user_id" = '${userId}'`;
    }

    unionQueries.push(`
      SELECT
        jsonb_build_object(
          'id', t."id",
          'tenant_id', t."tenant_id",
          'user_id', t."user_id",
          'form_id', t."form_id",
          'created_at', t."created_at",
          'updated_at', t."updated_at",
          'formData', to_jsonb(t) - ARRAY[${baseFields}]::text[]
        ) AS data,
        t."created_at" AS created_at,
        '${tableName}' as source_table
      FROM "${tableName}" AS t
      ${whereClause}
    `);

    countQueries.push(`
      SELECT COUNT(*) as count FROM "${tableName}"
      ${whereClause}
    `);
  }

  // Execute union query for data
  const unionSQL = unionQueries.join(" UNION ALL ");
  const rawData = await prisma.$queryRawUnsafe(`
    SELECT data, source_table
    FROM (
      SELECT data, source_table, created_at
      FROM (${unionSQL}) as all_responses
      ORDER BY created_at DESC
    ) as ordered_responses
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Execute count query
  const countSQL = countQueries.join(" UNION ALL ");
  const countResults = await prisma.$queryRawUnsafe(`
    SELECT SUM(count)::int as total FROM (${countSQL}) as counts
  `);

  return {
    data: rawData.map((row) => {
      const baseData = row.data || {};
      const { formData = {}, ...core } = baseData;
      return {
        ...core,
        ...formData,
        source_table: row.source_table,
      };
    }),
    count: countResults[0]?.total || 0,
    tables: tables.map((t) => t.table_name),
  };
}

/**
 * Get table schema/columns for a form
 */
async function getTableSchema(tenantId, formId) {
  const tableName = `tenant_${tenantId.replace(
    /-/g,
    "_"
  )}_form_${formId.replace(/-/g, "_")}`;

  const tableExists = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = '${tableName}'
    );
  `);

  if (!tableExists[0].exists) {
    return null;
  }

  const columns = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = '${tableName}'
    ORDER BY ordinal_position
  `);

  return {
    tableName,
    columns,
  };
}

/**
 * Get a specific user's form submissions
 */
async function getUserFormResponse({ tenantId, formId, userId }) {
  const tableName = `tenant_${tenantId.replace(
    /-/g,
    "_"
  )}_form_${formId.replace(/-/g, "_")}`;

  // Check if table exists
  const tableExists = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = '${tableName}'
    );
  `);

  if (!tableExists[0].exists) {
    return { data: [], count: 0 };
  }

  // Get specific user's data
  const data = await prisma.$queryRawUnsafe(`
    SELECT * FROM "${tableName}"
    WHERE "tenant_id" = '${tenantId}'
      AND "form_id" = '${formId}'
      AND "user_id" = '${userId}'
    ORDER BY "created_at" DESC
  `);

  return {
    data,
    count: data.length,
    tableName,
  };
}

/**
 * Update a specific user's form response
 */
async function updateUserFormResponse({
  tenantId,
  formId,
  userId,
  responseId,
  schema,
  formData,
}) {
  const tableName = `tenant_${tenantId.replace(
    /-/g,
    "_"
  )}_form_${formId.replace(/-/g, "_")}`;

  // Check if table exists
  const tableExists = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = '${tableName}'
    );
  `);

  if (!tableExists[0].exists) {
    throw new Error("Form table does not exist. No submissions found.");
  }

  // Check if response exists and belongs to the user
  const existing = await prisma.$queryRawUnsafe(`
    SELECT * FROM "${tableName}"
    WHERE "id" = '${responseId}'
      AND "tenant_id" = '${tenantId}'
      AND "form_id" = '${formId}'
      AND "user_id" = '${userId}'
  `);

  if (!existing || existing.length === 0) {
    throw new Error("Response not found or access denied");
  }

  // Build SET clause for update
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  // Create a map of field names to types
  const fieldTypeMap = {};
  schema.fields.forEach((field) => {
    const colName = field.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    fieldTypeMap[colName] = field.type;
  });

  schema.fields.forEach((field) => {
    const colName = field.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    const value = formData[field.name];

    if (value !== undefined && value !== null) {
      const fieldType = fieldTypeMap[colName];
      let typeCast = "";

      if (fieldType === "date") {
        typeCast = "::date";
      } else if (fieldType === "number") {
        typeCast = "::numeric";
      } else if (fieldType === "checkbox") {
        typeCast = "::boolean";
      }

      setClauses.push(`"${colName}" = $${paramIndex}${typeCast}`);
      values.push(value);
      paramIndex++;
    }
  });

  if (setClauses.length === 0) {
    throw new Error("No valid fields to update");
  }

  // Add updated_at
  const now = new Date();
  setClauses.push(`"updated_at" = $${paramIndex}::timestamp`);
  values.push(now);
  paramIndex++;

  // Add WHERE clause values
  values.push(responseId, tenantId, formId, userId);

  const updateSQL = `
    UPDATE "${tableName}"
    SET ${setClauses.join(", ")}
    WHERE "id" = $${paramIndex}
      AND "tenant_id" = $${paramIndex + 1}
      AND "form_id" = $${paramIndex + 2}
      AND "user_id" = $${paramIndex + 3}
    RETURNING *
  `;

  const result = await prisma.$queryRawUnsafe(updateSQL, ...values);

  if (!result || result.length === 0) {
    throw new Error("Failed to update response");
  }

  return {
    data: result[0],
    tableName,
  };
}

/**
 * Delete a specific user's form response
 */
async function deleteUserFormResponse({
  tenantId,
  formId,
  userId,
  responseId,
}) {
  const tableName = `tenant_${tenantId.replace(
    /-/g,
    "_"
  )}_form_${formId.replace(/-/g, "_")}`;

  // Check if table exists
  const tableExists = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = '${tableName}'
    );
  `);

  if (!tableExists[0].exists) {
    throw new Error("Form table does not exist. No submissions found.");
  }

  // Check if response exists and belongs to the user
  const existing = await prisma.$queryRawUnsafe(`
    SELECT * FROM "${tableName}"
    WHERE "id" = '${responseId}'
      AND "tenant_id" = '${tenantId}'
      AND "form_id" = '${formId}'
      AND "user_id" = '${userId}'
  `);

  if (!existing || existing.length === 0) {
    throw new Error("Response not found or access denied");
  }

  // Delete the response
  const deleteSQL = `
    DELETE FROM "${tableName}"
    WHERE "id" = $1
      AND "tenant_id" = $2
      AND "form_id" = $3
      AND "user_id" = $4
    RETURNING *
  `;

  const result = await prisma.$queryRawUnsafe(
    deleteSQL,
    responseId,
    tenantId,
    formId,
    userId
  );

  if (!result || result.length === 0) {
    throw new Error("Failed to delete response");
  }

  return {
    deleted: true,
    data: result[0],
    tableName,
  };
}

module.exports = {
  ensureFormDataTable,
  saveFormSubmission,
  getFormSubmissions,
  getAllFormSubmissions,
  getTableSchema,
  getUserFormResponse,
  updateUserFormResponse,
  deleteUserFormResponse,
};
