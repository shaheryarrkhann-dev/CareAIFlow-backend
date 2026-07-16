const express = require("express");
const router = express.Router();
const multer = require("multer");

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const {
  enforceTenantIsolation,
} = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const medicationController = require("../../controllers/medication/medication.controller");
const {
  createMedicationValidator,
  updateMedicationValidator,
  getMedicationsValidator,
  medicationIdValidator,
} = require("../../validators/medication.validators");

// Configure multer for prescription PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max for prescription PDFs
  },
  fileFilter: (req, file, cb) => {
    // Only accept PDF files
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(
        new Error("Only PDF files are allowed for prescription uploads"),
        false
      );
    }
  },
});

// All routes require authentication and EMAR:view (aligned with frontend eMAR)
router.use(authenticate());
router.use(requirePermission("EMAR", "view"));

router.post(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  upload.single("prescriptionPdf"), // Handle optional PDF upload
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "File too large. Maximum size is 10MB.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "File upload error",
      });
    }
    next();
  },
  validate(createMedicationValidator),
  medicationController.createMedication
);

router.get(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getMedicationsValidator),
  medicationController.getMedications
);

router.get(
  "/:id",
  validate(medicationIdValidator),
  medicationController.getMedicationById
);

router.put(
  "/:id",
  upload.single("prescriptionPdf"), // Handle optional PDF upload
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "File too large. Maximum size is 10MB.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "File upload error",
      });
    }
    next();
  },
  validate(updateMedicationValidator),
  medicationController.updateMedication
);

router.delete(
  "/:id",
  requireAdminOrSuperAdminForDelete(),
  validate(medicationIdValidator),
  medicationController.deleteMedication
);

router.post(
  "/:id/activate",
  validate(medicationIdValidator),
  medicationController.activateMedication
);

router.post(
  "/:id/deactivate",
  validate(medicationIdValidator),
  medicationController.deactivateMedication
);

module.exports = router;
