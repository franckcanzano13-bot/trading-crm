import { logger } from '../../shared/utils/index';
import { sendNotification } from '../../shared/websocket/ws-server';

export interface NotificationPayload {
  userId: string;
  type: 'MARGIN_CALL' | 'STOP_OUT' | 'ORDER_FILLED' | 'TRADE_CLOSED' | 'DEPOSIT' | 'WITHDRAWAL';
  message: string;
  details?: any;
}

/**
 * Notification service — sends alerts via WebSocket, and logs them.
 * In production, would also send via email, Telegram, and webhooks.
 */
export function notify(payload: NotificationPayload) {
  logger.info({ type: payload.type, userId: payload.userId }, payload.message);

  // Send via WebSocket
  sendNotification(payload.userId, {
    type: payload.type,
    message: payload.message,
    details: payload.details,
  });
}

/**
 * Send margin call notification.
 */
export function notifyMarginCall(userId: string, marginLevel: number) {
  notify({
    userId,
    type: 'MARGIN_CALL',
    message: `Margin call: your margin level is ${marginLevel.toFixed(1)}%`,
    details: { marginLevel },
  });
}

/**
 * Send stop-out notification.
 */
export function notifyStopOut(userId: string, liquidatedTradeIds: string[]) {
  notify({
    userId,
    type: 'STOP_OUT',
    message: `Stop-out: ${liquidatedTradeIds.length} position(s) liquidated`,
    details: { liquidatedTradeIds },
  });
}

/**
 * Send order filled notification.
 */
export function notifyOrderFilled(userId: string, symbol: string, side: string, volume: number) {
  notify({
    userId,
    type: 'ORDER_FILLED',
    message: `Order filled: ${side} ${volume} ${symbol}`,
    details: { symbol, side, volume },
  });
}
