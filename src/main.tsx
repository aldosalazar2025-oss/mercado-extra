import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "@/app/App";
import LimiteDeErrores from "@/components/LimiteDeErrores";
import { AuthProvider } from "@/features/auth/AuthContext";
import "./index.css";

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error, consulta) => console.error("No se pudo cargar:", consulta.queryKey, error) }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LimiteDeErrores>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </LimiteDeErrores>
  </StrictMode>,
);
