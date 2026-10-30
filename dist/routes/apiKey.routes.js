"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const apiKey_controller_1 = require("../controllers/apiKey.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const rateLimit_middleware_1 = require("../middlewares/rateLimit.middleware");
const router = (0, express_1.Router)();
// Gestion des clés : réservée au propriétaire authentifié par JWT.
router.use(auth_middleware_1.protect);
router.use((0, rateLimit_middleware_1.rateLimit)(20, 60000));
router.get('/', apiKey_controller_1.apiKeyController.list);
router.post('/', apiKey_controller_1.apiKeyController.create);
router.delete('/:id', apiKey_controller_1.apiKeyController.revoke);
exports.default = router;
