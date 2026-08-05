const prisma = require("../lib/prisma");
const {
  validateResidentId,
  getResidentById,
  extractResidentNameFromModel,
} = require("../services/resident/resident.service");

/**
 * Extract resident name from Resident model or form submission data (backward compatibility)
 * @param {Object} residentOrSubmission - Resident model object or form submission data
 * @returns {string} Resident name
 */
function extractResidentName(residentOrSubmission) {
  if (!residentOrSubmission) {
    return "Unknown Resident";
  }

  // If it's a Resident model object (has name fields - old or new schema)
  if (
    residentOrSubmission.residentFullLegalName ||
    residentOrSubmission.residentPreferredName ||
    residentOrSubmission.residentIdentificationFullLegalName ||
    residentOrSubmission.residentIdentificationPreferredName
  ) {
    return extractResidentNameFromModel(residentOrSubmission);
  }

  // Legacy: Extract from form submission data
  // Priority order: resident_name, residents_name, full_name, name, first_name + last_name
  if (residentOrSubmission.resident_name) {
    return residentOrSubmission.resident_name;
  }
  if (residentOrSubmission.residents_name) {
    return residentOrSubmission.residents_name;
  }
  if (residentOrSubmission.full_name) {
    return residentOrSubmission.full_name;
  }
  if (residentOrSubmission.name) {
    return residentOrSubmission.name;
  }
  if (residentOrSubmission.first_name && residentOrSubmission.last_name) {
    return `${residentOrSubmission.first_name} ${residentOrSubmission.last_name}`.trim();
  }
  return "Unknown Resident";
}

/**
 * Get resident data from Resident model
 * @param {string} residentId - Resident UUID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Resident data with name
 */
async function getResidentData(residentId, tenantId) {
  if (!residentId || !tenantId) {
    throw new Error("Resident ID and Tenant ID are required");
  }

  // Validate resident exists
  const isValid = await validateResidentId(residentId, tenantId);
  if (!isValid) {
    throw new Error(
      "Resident not found or does not belong to this organization"
    );
  }

  // Get resident by ID using Prisma directly for better performance
  const resident = await prisma.resident.findFirst({
    where: {
      id: residentId,
      tenantId: tenantId,
    },
  });

  if (!resident) {
    throw new Error(
      "Resident not found or does not belong to this organization"
    );
  }

  // Extract name
  const name = extractResidentNameFromModel(resident);

  return {
    id: resident.id,
    name: name,
    // Include full resident data for backward compatibility
    formData: resident,
    // Also include as residentData for clarity
    residentData: resident,
  };
}

module.exports = {
  extractResidentName,
  getResidentData,
};
