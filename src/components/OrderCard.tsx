
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, CreditCard, Package, FileText } from 'lucide-react';
import { Order } from '@/types/order';
import OrderStatusButtons from './OrderStatusButtons';

interface OrderCardProps {
  order: Order;
  onStatusChange?: (orderId: string, newStatus: 'confirmed' | 'preparing' | 'delivering' | 'delivered') => void;
}

const OrderCard = ({ order, onStatusChange }: OrderCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-blue-500';
      case 'preparing': return 'bg-orange-500';
      case 'delivering': return 'bg-purple-500';
      case 'delivered': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Confirmado';
      case 'preparing': return 'Preparando';
      case 'delivering': return 'Saiu para entrega';
      case 'delivered': return 'Entregue';
      default: return status;
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleStatusChange = (newStatus: 'confirmed' | 'preparing' | 'delivering' | 'delivered') => {
    if (onStatusChange) {
      onStatusChange(order.id, newStatus);
    }
  };

  return (
    <Card className="w-full hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold">
            Pedido #{order.id.slice(-8)}
          </CardTitle>
          <Badge className={`${getStatusColor(order.status)} text-white`}>
            {getStatusText(order.status)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Sessão: {order.sessionId.slice(0, 8)}...
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Itens do pedido */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Package className="h-4 w-4" />
            Itens do pedido
          </div>
          <div className="pl-6 space-y-1">
            {order.items.map((item, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span>{item.name}</span>
                <span className="font-medium">R$ {item.price.toFixed(2)}</span>
              </div>
            ))}
            {order.toppings.map((topping, index) => (
              <div key={index} className="flex justify-between text-sm text-muted-foreground">
                <span>+ {topping.name}</span>
                <span>R$ {topping.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="border-t pt-2">
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="text-lg text-green-600">R$ {order.total.toFixed(2)}</span>
          </div>
        </div>

        {/* Endereço */}
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <span>{order.address}</span>
        </div>

        {/* Forma de pagamento */}
        <div className="flex items-center gap-2 text-sm">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <span>{order.paymentMethod}</span>
        </div>

        {/* Observações */}
        {order.observations && (
          <div className="flex items-start gap-2 text-sm">
            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <span className="font-medium">Observações:</span>
              <p className="text-muted-foreground mt-1">{order.observations}</p>
            </div>
          </div>
        )}

        {/* Horários */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>
            Pedido: {formatTime(order.createdAt)}
            {order.estimatedDelivery && (
              <> • Previsão: {formatTime(order.estimatedDelivery)}</>
            )}
          </span>
        </div>

        {/* Botões de Status */}
        {onStatusChange && (
          <div className="border-t pt-4">
            <div className="text-sm font-medium mb-2">Atualizar Status:</div>
            <OrderStatusButtons 
              currentStatus={order.status}
              onStatusChange={handleStatusChange}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderCard;
