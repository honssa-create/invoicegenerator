import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-brand-100">
      <header className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-3xl">💰</span>
          <span className="font-bold text-xl text-gray-900">InvoiceFlow</span>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Link
            href="/login"
            className="flex-1 sm:flex-none text-center px-4 py-2.5 sm:py-2 text-sm font-medium text-gray-700 hover:text-gray-900 rounded-lg border border-transparent hover:border-gray-200"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="flex-1 sm:flex-none text-center px-4 py-2.5 sm:py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">
            Professional invoicing,
            <span className="text-brand-600"> simplified</span>
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-lg text-gray-600">
            Create, send, and track invoices with ease. Each team member gets their own
            secure account with separate customers and invoices — just like QuickBooks.
          </p>
          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              href="/register"
              className="px-8 py-3 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors shadow-lg shadow-brand-200"
            >
              Start free
            </Link>
            <Link
              href="/login"
              className="px-8 py-3 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="mt-16 sm:mt-24 grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
          {[
            {
              icon: '👤',
              title: 'Multi-user accounts',
              desc: 'Each person logs in with their own account. Data is fully isolated per user.',
            },
            {
              icon: '📄',
              title: 'Professional invoices',
              desc: 'Line items, tax calculations, status tracking, and print-ready invoice views.',
            },
            {
              icon: '📊',
              title: 'Dashboard insights',
              desc: 'Track revenue, pending payments, and overdue invoices at a glance.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm"
            >
              <span className="text-3xl">{feature.icon}</span>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">{feature.title}</h3>
              <p className="mt-2 text-gray-600 text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
