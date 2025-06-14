import { Button } from '@/components/ui/button';
import { Clock, Package, Truck, CheckCircle } from 'lucide-react';

interface OrderStatusButtonsProps {
  currentStatus: 'confirmed' | 'preparing' | 'delivering' | 'delivered';
  onStatusChange: (newStatus: 'confirmed' | 'preparing' | 'delivering' | 'delivered') => void;
}

const OrderStatusButtons = ({ currentStatus, onStatusChange }: OrderStatusButtonsProps) => {
  const statuses = [
    { key: 'confirmed', label: 'Confirmado', icon: Clock, color: 'bg-blue-500' },
    { key: 'preparing', label: 'Preparando', icon: Package, color: 'bg-orange-500' },
    { key: 'delivering', label: 'Saiu para entrega', icon: Truck, color: 'bg-purple-500' },
    { key: 'delivered', label: 'Entregue', icon: CheckCircle, color: 'bg-green-500' },
  ] as const;

  const currentIndex = statuses.findIndex(status => status.key === currentStatus);
  
  return (
    <div className="flex gap-2 flex-wrap">
      {statuses.map((status, index) => {
        const Icon = status.icon;
        const isActive = status.key === currentStatus;
        const isNext = index === currentIndex + 1;
        const isPrevious = index < currentIndex;
        
        return (
          <Button
            key={status.key}
            size="sm"
            variant={isActive ? "default" : "outline"}
            onClick={() => onStatusChange(status.key)}
            disabled={isPrevious}
            className={`
              ${isActive ? `${status.color} text-white hover:opacity-90` : ''}
              ${isNext ? 'border-2 border-blue-300' : ''}
              ${isPrevious ? 'opacity-50' : ''}
            `}
          >
            <Icon className="h-3 w-3 mr-1" />
            {status.label}
          </Button>
        );
      })}
    </div>
  );
};

export default OrderStatusButtons;
