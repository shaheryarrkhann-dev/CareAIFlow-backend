const prisma = require("../../lib/prisma");
const { getPresignedViewUrl, deleteFileFromS3 } = require("../../utils/s3.util");

function toPublicDelivery(delivery) {
  if (!delivery) return null;
  const { attachmentS3Key, ...rest } = delivery;
  return {
    ...rest,
    hasAttachment: Boolean(attachmentS3Key),
  };
}

/**
 * @param {object} data
 * @param {string} data.tenantId
 * @param {"email"|"fax"} data.type
 * @param {"sent"|"failed"|"queued"} [data.status]
 * @param {string} data.recipient
 * @param {string} [data.subject]
 * @param {string} [data.message]
 * @param {string} [data.filename]
 * @param {string} [data.recipientName]
 * @param {string} [data.senderName]
 * @param {string} [data.sourceModule]
 * @param {string} [data.jobId]
 * @param {string} [data.errorMessage]
 * @param {string} [data.attachmentS3Key]
 * @param {string} data.createdBy
 */
async function createOutboundDelivery(data) {
  return prisma.outboundDelivery.create({
    data: {
      tenantId: data.tenantId,
      type: data.type,
      status: data.status || "sent",
      recipient: data.recipient,
      subject: data.subject || null,
      message: data.message || null,
      filename: data.filename || null,
      recipientName: data.recipientName || null,
      senderName: data.senderName || null,
      sourceModule: data.sourceModule || null,
      jobId:
        data.jobId != null && data.jobId !== ""
          ? String(data.jobId)
          : null,
      errorMessage: data.errorMessage || null,
      createdBy: data.createdBy,
    },
  });
}

/**
 * @param {string} id
 * @param {string} tenantId
 * @param {string} attachmentS3Key
 */
async function updateOutboundDeliveryAttachment(id, tenantId, attachmentS3Key) {
  if (!attachmentS3Key) return;

  try {
    await prisma.outboundDelivery.updateMany({
      where: { id, tenantId },
      data: { attachmentS3Key },
    });
  } catch (err) {
    console.error(
      "[OutboundDelivery] Failed to link attachment to delivery:",
      err.message
    );
  }
}

/**
 * @param {string|null|undefined} tenantId
 * @param {object} [options]
 * @param {number} [options.page]
 * @param {number} [options.limit]
 * @param {string} [options.type] - "email" | "fax" | "all"
 * @param {string} [options.search]
 */
async function listOutboundDeliveries(tenantId, options = {}) {
  if (!tenantId) {
    return {
      deliveries: [],
      pagination: { page: 1, limit: 30, total: 0, totalPages: 1 },
    };
  }

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 30));
  const skip = (page - 1) * limit;

  const where = { tenantId };

  if (options.type && options.type !== "all") {
    where.type = options.type;
  }

  const search = options.search && String(options.search).trim();
  if (search) {
    where.OR = [
      { recipient: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
      { filename: { contains: search, mode: "insensitive" } },
      { recipientName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [deliveries, total] = await Promise.all([
    prisma.outboundDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.outboundDelivery.count({ where }),
  ]);

  return {
    deliveries: deliveries.map(toPublicDelivery),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/**
 * @param {string} id
 * @param {string|null|undefined} tenantId
 */
async function getOutboundDeliveryById(id, tenantId) {
  if (!tenantId) return null;

  const delivery = await prisma.outboundDelivery.findFirst({
    where: { id, tenantId },
  });
  return toPublicDelivery(delivery);
}

/**
 * @param {string} id
 * @param {string|null|undefined} tenantId
 */
async function getAttachmentViewUrl(id, tenantId) {
  if (!tenantId) return null;

  const delivery = await prisma.outboundDelivery.findFirst({
    where: { id, tenantId },
    select: { attachmentS3Key: true, filename: true },
  });

  if (!delivery?.attachmentS3Key) return null;

  const viewUrl = await getPresignedViewUrl(delivery.attachmentS3Key);
  return {
    viewUrl,
    mimeType: "application/pdf",
    fileName: delivery.filename || "attachment.pdf",
  };
}

/**
 * @param {string} id
 * @param {string|null|undefined} tenantId
 */
async function deleteOutboundDelivery(id, tenantId) {
  if (!tenantId) return false;

  const delivery = await prisma.outboundDelivery.findFirst({
    where: { id, tenantId },
  });

  if (!delivery) return false;

  if (delivery.attachmentS3Key) {
    try {
      await deleteFileFromS3(delivery.attachmentS3Key);
    } catch (err) {
      console.error(
        "[OutboundDelivery] Failed to delete attachment from S3:",
        err.message
      );
    }
  }

  await prisma.outboundDelivery.delete({ where: { id: delivery.id } });
  return true;
}

module.exports = {
  createOutboundDelivery,
  updateOutboundDeliveryAttachment,
  listOutboundDeliveries,
  getOutboundDeliveryById,
  getAttachmentViewUrl,
  deleteOutboundDelivery,
};
