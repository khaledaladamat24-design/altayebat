import { Router, type IRouter } from "express";
import healthRouter from "./health";
import categoriesRouter from "./categories";
import productsRouter from "./products";
import cartRouter from "./cart";
import ordersRouter from "./orders";
import bannersRouter from "./banners";
import summaryRouter from "./summary";
import adminRouter from "./admin";
import usersRouter from "./users";
import vendorsRouter from "./vendors";
import authRouter from "./auth";
import deliveryRouter from "./delivery";
import uploadsRouter from "./uploads";
import devicesRouter from "./devices";

const router: IRouter = Router();

router.use(healthRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(cartRouter);
router.use(ordersRouter);
router.use(bannersRouter);
router.use(summaryRouter);
router.use(adminRouter);
router.use(usersRouter);
router.use(vendorsRouter);
router.use(authRouter);
router.use(deliveryRouter);
router.use(uploadsRouter);
router.use(devicesRouter);

export default router;
