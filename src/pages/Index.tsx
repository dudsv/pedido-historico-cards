
import { useState } from "react";
import { OrdersBoard } from "@/components/OrdersBoard";
import { OrdersHeader } from "@/components/OrdersHeader";

const Index = () => {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <OrdersHeader searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        <OrdersBoard searchTerm={searchTerm} />
      </div>
    </div>
  );
};

export default Index;
