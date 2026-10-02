import { z } from 'zod';
import { dateSchema, idSchema } from './schemas';

export const AUDIT_LIMIT = 1000;

export const auditQuerySchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    entityType: z.string().trim().max(40).optional(),
    action: z.string().trim().max(40).optional(),
    userId: idSchema.optional(),
  })
  .refine((v) => v.to >= v.from, { message: 'Bitiş başlangıçtan önce olamaz', path: ['to'] });
export type AuditQueryInput = z.input<typeof auditQuerySchema>;

export interface AuditLogDto {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

export interface AuditLogListDto {
  items: AuditLogDto[];
  truncated: boolean;
  users: { id: string; name: string }[];
}

export const auditEntityLabels: Record<string, string> = {
  Announcement: 'Duyuru',
  Attachment: 'Belge',
  BankImport: 'Banka hareketi',
  Budget: 'İşletme projesi',
  Block: 'Blok',
  Branding: 'Marka',
  CashAccount: 'Kasa hesabı',
  Charge: 'Borç',
  ChargeType: 'Borç türü',
  Clearance: 'Borç durum yazısı',
  DuesPlan: 'Aidat planı',
  DuesSettings: 'Aidat ayarı',
  Employee: 'Çalışan',
  FinanceCategory: 'Kategori',
  Meeting: 'Genel kurul',
  MessageCampaign: 'Mesaj gönderimi',
  MessageTemplate: 'Mesaj şablonu',
  MonthClosing: 'Ay kapanışı',
  Occupancy: 'Sakin',
  OnlinePaymentSettings: 'Online ödeme ayarı',
  Payment: 'Tahsilat',
  PaymentIntent: 'Online ödeme',
  RecurringTask: 'Tekrarlayan görev',
  ReminderSettings: 'Hatırlatma ayarı',
  Shift: 'Vardiya',
  Site: 'Site',
  ServiceRequest: 'Arıza/talep',
  SiteMembership: 'Yetki',
  Task: 'Görev',
  Transaction: 'Kasa hareketi',
  Unit: 'Daire',
  User: 'Kullanıcı',
  Vendor: 'Firma',
  Work: 'Yapılan iş',
};

export const auditActionLabels: Record<string, string> = {
  CREATE: 'Ekleme',
  UPDATE: 'Düzenleme',
  DELETE: 'Silme',
  CANCEL: 'İptal',
  ARCHIVE: 'Arşivleme',
  UNARCHIVE: 'Arşivden çıkarma',
  MOVE_OUT: 'Taşındı',
  UNDO_MOVE_OUT: 'Taşındı işareti kaldırıldı',
  INVITATION_CREATED: 'Davet bağlantısı',
  INVITATION_ACCEPTED: 'Davet kabul edildi',
  PASSWORD_RESET_LINK: 'Şifre bağlantısı',
  PASSWORD_RESET: 'Şifre yenilendi',
  PASSWORD_CHANGED: 'Şifre değiştirildi',
  OFFICER_ASSIGNED: 'Yetki verildi',
  OFFICER_REMOVED: 'Yetki kaldırıldı',
  MANAGER_ASSIGNED: 'Yönetici atandı',
  MANAGER_REMOVED: 'Yönetici kaldırıldı',
  ACCRUE: 'Aidat tahakkuku',
  BULK_CREATE: 'Toplu ekleme',
  REFLECT: 'Dairelere yansıtma',
  UNREFLECT: 'Yansıtma geri alındı',
  RESTORE: 'Geri getirildi',
  PURGE: 'Kalıcı silindi',
  CLOSE: 'Ay kapatma',
  REOPEN: 'Kapanış geri alındı',
  REFUND: 'İade',
  ONLINE_PAYMENT: 'Online ödeme',
  CHECKOUT: 'Ödeme başlatıldı',
  SEND: 'Gönderim',
  RETRY: 'Yeniden deneme',
  UPLOAD: 'Yükleme',
  UPLOAD_LOGO: 'Logo yükleme',
  DELETE_LOGO: 'Logo silme',
  STATUS: 'Durum değişikliği',
  COPY_WEEK: 'Hafta kopyalama',
  ISSUE: 'Yazı düzenlendi',
  IMPORT: 'İçe aktarma',
  IGNORE: 'Yoksayıldı',
  COMMENT: 'Yanıt',
  CREATE_TASK: 'Görev oluşturuldu',
  APPLY: 'Aidat planına uygulandı',
  SHARE: 'Duyuru olarak paylaşıldı',
  CALL: 'Çağrı yayınlandı',
  ATTENDANCE: 'Hazirun',
  DECISION: 'Karar',
  COMPLETE: 'Toplantı tamamlandı',
};

export const auditLabel = (labels: Record<string, string>, key: string) => labels[key] ?? key;
