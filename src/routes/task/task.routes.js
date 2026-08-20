const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const {
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const validate = require("../../middlewares/validate.middleware");
const taskController = require("../../controllers/task/task.controller");
const {
  createTaskValidator,
  updateTaskValidator,
  taskIdValidator,
  listTasksValidator,
} = require("../../validators/task.validators");

router.use(authenticate());

// Task CRUD
router.post("/", validate(createTaskValidator), taskController.create);
router.get("/", validate(listTasksValidator), taskController.list);
router.get("/stats", taskController.stats);
router.get("/:id", validate(taskIdValidator), taskController.getById);
router.patch("/:id", validate(updateTaskValidator), taskController.update);
router.delete(
  "/:id",
  requireAdminOrSuperAdminForDelete(),
  validate(taskIdValidator),
  taskController.remove
);

module.exports = router;
