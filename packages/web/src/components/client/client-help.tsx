'use client';

const FAQ_ITEMS = [
  {
    question: 'How do I place a trade?',
    answer: 'Navigate to the Trading Terminal, select an instrument from the watchlist, set your volume and click Buy or Sell.',
  },
  {
    question: 'How do I deposit funds?',
    answer: 'Go to the Funds page from the sidebar, choose your preferred payment method and enter the amount.',
  },
  {
    question: 'What is copy trading?',
    answer: 'Copy trading allows you to automatically replicate the trades of experienced traders. Visit the Copy Trading section to browse top performers.',
  },
  {
    question: 'How do I set price alerts?',
    answer: 'Go to Price Alerts, select an instrument, set your target price and condition (above/below), and we\'ll notify you when it triggers.',
  },
  {
    question: 'What leverage is available?',
    answer: 'Leverage varies by instrument type. Forex pairs offer up to 1:500, Crypto up to 1:10, and Indices up to 1:200.',
  },
  {
    question: 'How do I close a position?',
    answer: 'In the Trading Terminal, find your open position in the bottom bar and click the X button to close it at the current market price.',
  },
  {
    question: 'How long do withdrawals take?',
    answer: 'Withdrawal processing times vary by method. Bank transfers take 1-3 business days, while crypto withdrawals are typically processed within 1 hour.',
  },
  {
    question: 'How do I change my password?',
    answer: 'Go to Settings > Security section and click "Change Password" to update your credentials.',
  },
];

const CONTACT_OPTIONS = [
  { label: 'Live Chat', description: 'Get instant help from our support team', icon: 'chat', available: true },
  { label: 'Email Support', description: 'support@tradexlabel.com', icon: 'email', available: true },
  { label: 'Phone', description: '+1 (800) 123-4567', icon: 'phone', available: true },
  { label: 'Knowledge Base', description: 'Browse articles and tutorials', icon: 'book', available: true },
];

export function ClientHelp() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Help Center</h1>
        <p className="text-sm text-muted-foreground mt-1">Find answers to common questions or contact our support team</p>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search for help..."
          className="w-full pl-12 pr-4 py-3.5 bg-card border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Contact Options */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Contact Support</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CONTACT_OPTIONS.map((option) => (
            <button
              key={option.label}
              className="bg-card border border-border rounded-2xl p-5 text-left hover:border-primary/40 hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <ContactIcon name={option.icon} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{option.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
                  {option.available && (
                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-medium text-green-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Available now
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <details
              key={i}
              className="bg-card border border-border rounded-2xl overflow-hidden group"
            >
              <summary className="px-5 py-4 cursor-pointer text-sm font-medium text-foreground hover:text-primary transition-colors list-none flex items-center justify-between">
                {item.question}
                <svg className="w-4 h-4 text-muted-foreground shrink-0 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
                {item.answer}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Can&apos;t find what you&apos;re looking for?
        </p>
        <button className="mt-3 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
          Contact Support
        </button>
      </div>
    </div>
  );
}

function ContactIcon({ name }: { name: string }) {
  const cls = "w-5 h-5 text-primary";
  switch (name) {
    case 'chat':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>;
    case 'email':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
    case 'phone':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>;
    case 'book':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
    default:
      return <div className={cls} />;
  }
}
