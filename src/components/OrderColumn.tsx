
import { OrderCard } from "@/components/OrderCard";

interface Order {
  id: string;
  session_id: string;
  total: number;
  address: string;
  payment_method: string;
  status: string;
  observations: string | null;
  items: any;
  toppings: any;
  estimated_delivery: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderColumnProps {
  title: string;
  status: string;
  color: string;
  orders: Order[];
  onRefresh: () => void;
}

export const OrderColumn = ({ title, status, color, orders, onRefresh }: OrderColumnProps) => {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${color}`}>
          {orders.length}
        </span>
      </div>
      
      <div className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-gray-500 text-center py-8 text-sm">
            Nenhum pedido {title.toLowerCase()}
          </p>
        ) : (
          orders.map((order) => (
            <OrderCard 
              key={order.id} 
              order={order} 
              onStatusChange={onRefresh}
            />
          ))
        )}
      </div>
    </div>
  );
};
