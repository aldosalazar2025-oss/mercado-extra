import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; discreto?: boolean };
type Estado = { fallo: boolean };

// Si algo falla al dibujar, solo se cae esa parte y no toda la página.
// "discreto": para piezas secundarias (como la campana): si fallan, simplemente no se muestran.
export default class LimiteDeErrores extends Component<Props, Estado> {
  state: Estado = { fallo: false };

  static getDerivedStateFromError(): Estado {
    return { fallo: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error de pantalla:", error, info.componentStack);
  }

  render() {
    if (!this.state.fallo) return this.props.children;
    if (this.props.discreto) return null;
    return (
      <main className="mx-auto max-w-xl space-y-4 px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-extrabold text-pino">Algo salió mal</h1>
        <p className="text-suave">Tuvimos un problema al mostrar esta página. Tus datos están a salvo.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center rounded-lg bg-mercado px-4 font-bold text-white hover:bg-pino">Recargar la página</button>
          <a href="/" className="inline-flex min-h-11 items-center rounded-lg border-2 border-mercado px-4 font-bold text-mercado hover:bg-hoja">Ir al inicio</a>
        </div>
      </main>
    );
  }
}
