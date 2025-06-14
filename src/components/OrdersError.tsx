
interface OrdersErrorProps {
  error: Error;
  onRetry: () => void;
}

export const OrdersError = ({ error, onRetry }: OrdersErrorProps) => {
  console.error("Query error:", error);
  
  return (
    <div className="text-center py-12">
      <p className="text-red-600">Erro ao carregar pedidos: {error.message}</p>
      <button 
        onClick={onRetry}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Tentar novamente
      </button>
    </div>
  );
};
