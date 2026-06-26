import { Router } from 'express';
import { jwtMiddleware } from '../auth/jwt.middleware';
import {
  editDealMessageHandler,
  getDealMessagesHandler,
  getUnreadCountsHandler,
  markDealMessagesReadHandler,
  searchDealMessagesHandler,
  sendDealMessageHandler,
} from './messages.router';

const router = Router();

router.get('/unread-counts', jwtMiddleware, getUnreadCountsHandler);
router.get('/deal/:onChainId/search', jwtMiddleware, searchDealMessagesHandler);
router.get('/deal/:onChainId', jwtMiddleware, getDealMessagesHandler);
router.post('/deal/:onChainId', jwtMiddleware, sendDealMessageHandler);
router.post('/deal/:onChainId/read', jwtMiddleware, markDealMessagesReadHandler);
router.patch('/deal/:onChainId/:messageId', jwtMiddleware, editDealMessageHandler);

export default router;
