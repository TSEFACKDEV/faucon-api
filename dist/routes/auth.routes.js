"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const rateLimit_middleware_1 = require("../middlewares/rateLimit.middleware");
const router = (0, express_1.Router)();
// 10 tentatives / 15 min / IP — limite le brute-force sur les identifiants.
const authRateLimit = (0, rateLimit_middleware_1.rateLimit)(10, 15 * 60 * 1000);
router.post('/register', authRateLimit, auth_controller_1.authController.register);
router.post('/login', authRateLimit, auth_controller_1.authController.login);
router.post('/logout', auth_controller_1.authController.logout);
router.post('/refresh', auth_controller_1.authController.refresh);
router.get('/me', auth_middleware_1.protect, auth_controller_1.authController.me);
router.patch('/me', auth_middleware_1.protect, auth_controller_1.authController.updateMe);
exports.default = router;
