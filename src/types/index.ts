export interface AdminRange {
  min: number;
  max: number;
  fee: number;
}

export interface AdminFeeTier {
  id: string;
  minAmount: number;
  maxAmount: number;
  adminFee: number;
  label: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  unit: string;
  isFuel?: boolean;
  masterType?: 'barang' | 'ppob_range' | 'ps';
  ppobProvider?: string;
  adminRanges?: AdminRange[]; // Range fee per layanan PPOB
  imageUrl?: string; // Cloudinary secure URL
  provider?: string; // e.g. Tri, Telkomsel, Axis, Indosat, XL, Smartfren
  quota?: string; // e.g. "10 GB"
  validity?: string; // e.g. "3 Hari" / "30 Hari"
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface TransactionItem {
  productId: string;
  name: string;
  price: number;
  cost: number;
  quantity: number;
  subtotal: number;
}

export interface Transaction {
  id: string;
  invoiceNumber: string;
  cashierName: string;
  cashierId: string;
  customerName: string;
  items: TransactionItem[];
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  discount: number;
  finalAmount: number;
  paymentMethod: 'Tunai' | 'QRIS' | 'Transfer Bank' | 'Debit' | 'Hutang / Kas Bon';
  amountPaid: number;
  change: number;
  status: 'completed' | 'cancelled';
  notes?: string;
  adminFee?: number;
  customerPhone?: string;
  dateString: string; // YYYY-MM-DD
  createdAt: string;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  notes?: string;
  createdBy: string;
  dateString: string; // YYYY-MM-DD
  createdAt: string;
}

export interface Debt {
  id: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  description?: string;
  dueDate?: string;
  status: 'unpaid' | 'partial' | 'paid';
  createdAt: string;
  updatedAt?: string;
}

export interface PsRental {
  id: string;
  unitName: string;
  psType: 'PS3' | 'PS4' | 'PS5';
  hourlyRate: number;      // e.g. 5000 / jam
  halfHourlyRate?: number;  // e.g. 3000 / 30 menit
  status: 'available' | 'in_use' | 'finished';
  customerName?: string;
  customerPhone?: string;
  startTime?: string;
  durationMinutes?: number; // durasi dalam menit (30, 60, 90, 120, dll)
  durationHours?: number;   // backward compatibility
  expectedEndTime?: string;
  totalCost?: number;
  paymentStatus?: 'unpaid' | 'paid';
  notes?: string;
  updatedAt?: string;
}

export interface PsSavedTime {
  id: string;
  customerName: string;
  customerPhone?: string;
  remainingMinutes: number; // sisa menit bermain (misal 25 menit)
  savedFromUnitId?: string;
  savedFromUnitName?: string;
  psType?: 'PS3' | 'PS4' | 'PS5';
  notes?: string;
  savedAt: string;
  status: 'active' | 'used';
  usedAt?: string;
  usedInUnitName?: string;
}

export interface BusinessSettings {
  businessName: string;
  tagline: string;
  address: string;
  phone: string;
  receiptFooter: string;
  adminFeeTiers?: AdminFeeTier[];
  cloudinaryCloudName?: string;
  cloudinaryUploadPreset?: string;
  cloudinaryApiKey?: string;
  geminiApiKey?: string;
  updatedAt?: string;
}

export interface UserProfile {
  uid: string;
  username?: string;
  displayName: string;
  email: string;
  role: 'admin' | 'kasir';
  photoURL?: string;
  phone?: string;
  notes?: string;
  createdAt?: string;
}

export interface AppUser {
  id: string;
  username: string;
  password?: string;
  email: string;
  displayName: string;
  role: 'admin' | 'kasir';
  phone?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}
