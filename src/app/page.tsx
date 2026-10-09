export default function HomePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <h1 className="mb-4 text-4xl font-bold text-gray-800">Financial App</h1>
      <p className="mb-8 max-w-lg text-center text-lg text-gray-600">
        Acompanhe seus gastos, gerencie seus investimentos e planeje seu futuro
        financeiro.
      </p>
      <a
        href="/dashboard"
        className="rounded-lg bg-brand-600 px-6 py-3 text-white transition-colors hover:bg-brand-700"
      >
        Ir para o Dashboard
      </a>
    </div>
  );
}
