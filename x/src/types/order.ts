
export interface ChatHistory {
  id: number;
  session_id: string;
  message: any; // Changed from string to any since it's Json type from Supabase
  created_at?: string;
}

export interface OrderItem {
  name: string;
  price: number;
}

export interface Order {
  id: string;
  sessionId: string;
  items: OrderItem[];
  toppings: OrderItem[];
  total: number;
  address: string;
  paymentMethod: string;
  status: 'confirmed' | 'preparing' | 'delivering' | 'delivered';
  createdAt: string;
  estimatedDelivery?: string;
  observations?: string;
}

export interface ParsedMessage {
  type: 'human' | 'ai';
  content: string;
}
