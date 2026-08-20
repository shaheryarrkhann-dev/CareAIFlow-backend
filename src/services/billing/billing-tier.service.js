const prisma = require("../../lib/prisma");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Create billing tier
 * @param {Object} data - Billing tier data
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Created billing tier
 */
async function createBillingTier(data, user) {
  const { name, description, monthlyRate, isActive } = data;

  // Determine tenantId
  let tenantId = user.tenantId;
  if (user.role === "SUPER_ADMIN" && data.tenantId) {
    tenantId = data.tenantId;
  }

  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  // Validate monthly rate is positive
  if (monthlyRate <= 0) {
    throw new Error("Monthly rate must be greater than 0");
  }

  // Check if tier name already exists for this tenant
  const existingTier = await prisma.billingTier.findFirst({
    where: {
      tenantId,
      name: name.trim(),
    },
  });

  if (existingTier) {
    throw new Error("A billing tier with this name already exists");
  }

  const billingTier = await prisma.billingTier.create({
    data: {
      tenantId,
      name: name.trim(),
      description: description?.trim() || null,
      monthlyRate,
      isActive: isActive ?? true,
    },
  });

  return billingTier;
}

/**
 * Get billing tiers with filtering
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Billing tiers with pagination
 */
async function getBillingTiers(tenantId, filters = {}) {
  const { page, limit, isActive, search } = filters;

  const where = {
    tenantId,
  };

  // Filter by active status
  if (isActive !== undefined) {
    where.isActive = isActive === true || isActive === "true";
  }

  // Search filter (name or description)
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  // Pagination
  const skip = page && limit ? (page - 1) * limit : undefined;
  const take = limit;

  const [tiers, total] = await Promise.all([
    prisma.billingTier.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.billingTier.count({ where }),
  ]);

  return {
    tiers,
    pagination:
      page && limit
        ? {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          }
        : { total },
  };
}

/**
 * Get billing tier by ID
 * @param {string} id - Billing tier ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Billing tier
 */
async function getBillingTierById(id, tenantId) {
  const billingTier = await prisma.billingTier.findFirst({
    where: {
      id,
      tenantId,
    },
  });

  if (!billingTier) {
    throw new Error("Billing tier not found");
  }

  return billingTier;
}

/**
 * Update billing tier
 * @param {string} id - Billing tier ID
 * @param {Object} data - Update data
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Updated billing tier
 */
async function updateBillingTier(id, data, user) {
  const { name, description, monthlyRate, isActive } = data;

  // Determine tenantId
  let tenantId = user.tenantId;
  if (user.role === "SUPER_ADMIN" && data.tenantId) {
    tenantId = data.tenantId;
  }

  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  // Check if tier exists
  const existingTier = await getBillingTierById(id, tenantId);

  // Validate monthly rate if provided
  if (monthlyRate !== undefined && monthlyRate <= 0) {
    throw new Error("Monthly rate must be greater than 0");
  }

  // Check if name already exists (if name is being changed)
  if (name && name.trim() !== existingTier.name) {
    const nameConflict = await prisma.billingTier.findFirst({
      where: {
        tenantId,
        name: name.trim(),
        id: { not: id },
      },
    });

    if (nameConflict) {
      throw new Error("A billing tier with this name already exists");
    }
  }

  // Build update data
  const updateData = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined)
    updateData.description = description?.trim() || null;
  if (monthlyRate !== undefined) updateData.monthlyRate = monthlyRate;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updatedTier = await prisma.billingTier.update({
    where: { id },
    data: updateData,
  });

  return updatedTier;
}

/**
 * Delete billing tier
 * @param {string} id - Billing tier ID
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Deleted billing tier
 */
async function deleteBillingTier(id, user) {
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new Error("Only an administrator can delete this.");
  }

  // Determine tenantId
  let tenantId = user.tenantId;
  if (user.role === "SUPER_ADMIN") {
    // For SUPER_ADMIN, get the tier first to determine tenantId
    const tier = await prisma.billingTier.findUnique({
      where: { id },
    });
    if (!tier) {
      throw new Error("Billing tier not found");
    }
    tenantId = tier.tenantId;
  }

  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  // Check if tier exists (will throw if not found)
  await getBillingTierById(id, tenantId);

  // Check if tier is assigned to any residents
  const residentCount = await prisma.residentBilling.count({
    where: {
      billingTierId: id,
      isActive: true,
    },
  });

  if (residentCount > 0) {
    throw new Error(
      `Cannot delete billing tier. It is currently assigned to ${residentCount} resident(s). Please reassign residents first.`
    );
  }

  // Check if tier has any invoices
  const invoiceCount = await prisma.invoice.count({
    where: {
      billingTierId: id,
    },
  });

  if (invoiceCount > 0) {
    throw new Error(
      `Cannot delete billing tier. It has ${invoiceCount} associated invoice(s). Billing tiers with invoices cannot be deleted.`
    );
  }

  // Delete the tier
  const deletedTier = await prisma.billingTier.delete({
    where: { id },
  });

  return deletedTier;
}

/**
 * Get residents by billing tier
 * @param {string} tierId - Billing tier ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} List of residents with this tier
 */
async function getResidentsByTier(tierId, tenantId) {
  // Validate tier exists
  await getBillingTierById(tierId, tenantId);

  // Get all active resident billings for this tier
  const residentBillings = await prisma.residentBilling.findMany({
    where: {
      tenantId,
      billingTierId: tierId,
      isActive: true,
    },
    include: {
      billingTier: {
        select: {
          id: true,
          name: true,
          monthlyRate: true,
        },
      },
    },
    orderBy: {
      startDate: "desc",
    },
  });

  return residentBillings;
}

/**
 * Generate billing tier features using AI
 * @param {string} hints - User-provided hints/description
 * @param {string} tierName - Optional tier name for context
 * @returns {Promise<string[]>} Generated features array
 */
async function generateFeaturesWithAI(hints, tierName = "") {
  const systemInstructions = `You are a professional billing tier specialist for assisted living facilities. Your task is to generate a list of features/facilities that a billing tier would include based on the user's hints.

IMPORTANT GUIDELINES:
1. Generate 5-7 specific, relevant features
2. Each feature should be a clear, concise statement (10-20 words)
3. Focus on care services, facilities, and support provided
4. Use professional, clear language
5. Features should be actionable and specific

OUTPUT FORMAT:
- Return ONLY a JSON object with a "features" key containing an array of strings
- Each string is one feature
- No markdown, no explanations, just the JSON object
- Example: {"features": ["24/7 care and supervision", "Medication management", "Meal planning and preparation"]}

COMMON FEATURES TO CONSIDER:
- Care and supervision (24/7, daily, etc.)
- Medication management
- Meal services
- Personal care assistance
- Housekeeping
- Transportation
- Social activities
- Medical monitoring
- Memory care (if applicable)
- Mobility assistance (if applicable)
- Hygiene assistance (if applicable)`;

  const userPrompt = tierName
    ? `Generate features for a billing tier named "${tierName}" based on these hints: ${hints}`
    : `Generate features for a billing tier based on these hints: ${hints}`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstructions },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const responseContent = completion.choices[0].message.content.trim();

    // Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(responseContent);
    } catch {
      // If response is not JSON, try to extract array from text
      const arrayMatch = responseContent.match(/\[.*\]/s);
      if (arrayMatch) {
        parsed = JSON.parse(arrayMatch[0]);
      } else {
        // Fallback: split by lines
        const lines = responseContent
          .split("\n")
          .map((line) => line.replace(/^[-•*]\s*/, "").trim())
          .filter((line) => line.length > 0);
        return lines.slice(0, 7);
      }
    }

    // Handle different response formats
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 7);
    } else if (parsed.features && Array.isArray(parsed.features)) {
      return parsed.features.slice(0, 7);
    } else if (parsed.items && Array.isArray(parsed.items)) {
      return parsed.items.slice(0, 7);
    } else {
      // Fallback
      return [
        "24/7 care and supervision",
        "Medication management",
        "Meal planning and preparation",
      ];
    }
  } catch (error) {
    console.error("[AI Feature Generation] Error:", error);
    throw new Error(
      `Failed to generate features: ${
        error.message || "AI service unavailable"
      }`
    );
  }
}

module.exports = {
  createBillingTier,
  getBillingTiers,
  getBillingTierById,
  updateBillingTier,
  deleteBillingTier,
  getResidentsByTier,
  generateFeaturesWithAI,
};
