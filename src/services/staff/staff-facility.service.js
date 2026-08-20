const prisma = require("../../lib/prisma");
const facilityService = require("../facility/facility.service");
const staffMemberService = require("./staff-member.service");

/**
 * Assign staff to a facility
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - StaffMember ID
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Object>} StaffFacilityAssignment
 */
async function assignStaffToFacility(tenantId, staffId, facilityId) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);

  const facility = await prisma.facility.findUnique({ where: { id: facilityId } });
  if (!facility) {
    throw new Error("Facility not found");
  }

  const existing = await prisma.staffFacilityAssignment.findUnique({
    where: {
      staffId_facilityId: { staffId, facilityId },
    },
  });

  if (existing) {
    throw new Error("Staff is already assigned to this facility");
  }

  return prisma.staffFacilityAssignment.create({
    data: { staffId, facilityId },
    include: {
      facility: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Unassign staff from a facility
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - StaffMember ID
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Object>} Deleted assignment
 */
async function unassignStaffFromFacility(tenantId, staffId, facilityId) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);

  const assignment = await prisma.staffFacilityAssignment.findFirst({
    where: {
      staffId,
      facilityId,
      staff: { tenantId },
    },
    include: {
      facility: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!assignment) {
    throw new Error("Staff is not assigned to this facility");
  }

  await prisma.staffFacilityAssignment.delete({
    where: {
      staffId_facilityId: { staffId, facilityId },
    },
  });

  return assignment;
}

/**
 * List facilities assigned to a staff member
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - StaffMember ID
 * @returns {Promise<Array>} Facility assignments
 */
async function listFacilitiesForStaff(tenantId, staffId) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);

  return prisma.staffFacilityAssignment.findMany({
    where: { staffId },
    include: {
      facility: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

module.exports = {
  assignStaffToFacility,
  unassignStaffFromFacility,
  listFacilitiesForStaff,
};
