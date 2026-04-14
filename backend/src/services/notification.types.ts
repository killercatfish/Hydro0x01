export interface NotificationIntegration {
  telegram?: {
    enabled: boolean;
    botToken: string;
    chatId: string;
  };
  discord?: {
    enabled: boolean;
    webhookUrl: string;
  };
}

export interface AlertNotification {
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  device_id?: string;
}
