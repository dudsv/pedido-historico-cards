
import { Loader2 } from "lucide-react";

export const OrdersLoading = () => {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <span className="ml-2 text-gray-600">Carregando pedidos...</span>
    </div>
  );
};
