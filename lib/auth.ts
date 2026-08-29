/**
 * Authentication and Session Management for ShelfCash
 * Supports both Manager Portal and Staff/Branch Portal in Mock API and Real Backend.
 */

export type PortalMode = "manager" | "staff";

export type UserRole =
  | "store_manager"
  | "store_staff"
  | "procurement_specialist"
  | "barista"
  | "admin";

export interface UserSession {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  portal?: PortalMode;
  allowedPortals?: PortalMode[];
  permissions?: string[];
  storeId: string;
  storeName: string;
  mode: "mock" | "real";
  token?: string;
  backendUrl?: string;
  loggedInAt: string;
}

export const DEMO_USERS: Array<{
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  portal: PortalMode;
  storeId: string;
  storeName: string;
  avatarBg: string;
  description: string;
}> = [
  {
    id: "user-manager-01",
    name: "Nguyễn Minh Tuấn",
    email: "tuan.nguyen@shelfcash.vn",
    role: "store_manager",
    roleLabel: "Quản lý cửa hàng (Toàn quyền)",
    portal: "manager",
    storeId: "STORE_001",
    storeName: "ShelfCash Flagship Coffee & Tea",
    avatarBg: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    description: "Xem toàn bộ dashboard, dự báo nhu cầu, duyệt đơn mua và quản lý danh mục menu.",
  },
  {
    id: "user-staff-01",
    name: "Nguyễn Văn A",
    email: "staff01@shelfcash.vn",
    role: "store_staff",
    roleLabel: "Nhân viên chi nhánh",
    portal: "staff",
    storeId: "STORE_001",
    storeName: "ShelfCash Flagship Coffee & Tea",
    avatarBg: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
    description: "Thực thi công việc trong ca: nhận hàng theo PO, kiểm kho thực tế và báo cáo vấn đề phát sinh.",
  },
  {
    id: "user-procurement-02",
    name: "Trần Thị Mai Anh",
    email: "maianh.tran@shelfcash.vn",
    role: "procurement_specialist",
    roleLabel: "Chuyên viên Mua hàng & Cung ứng",
    portal: "manager",
    storeId: "STORE_001",
    storeName: "ShelfCash Flagship Coffee & Tea",
    avatarBg: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
    description: "Tập trung vào tối ưu kịch bản nhập hàng, so sánh nhà cung cấp và kiểm soát ngân sách.",
  },
  {
    id: "user-barista-03",
    name: "Lê Hoàng Quân",
    email: "quan.le@shelfcash.vn",
    role: "barista",
    roleLabel: "Trưởng ca / Barista Lead",
    portal: "staff",
    storeId: "STORE_001",
    storeName: "ShelfCash Flagship Coffee & Tea",
    avatarBg: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    description: "Theo dõi tồn kho lô hàng gần hạn FEFO, kiểm kê nguyên vật liệu và điều chỉnh hao hụt.",
  },
];

const SESSION_STORAGE_KEY = "shelfcash:auth:session";

export function getStoredSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export function saveSession(session: UserSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {}
}
