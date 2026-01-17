import { useState, useEffect } from 'react';
import { Send, CheckCircle } from 'lucide-react';
import Navigation from './Navigation';
import Footer from './Footer';

interface ContactUsProps {
  onClose: () => void;
  onShowComingSoon: () => void;
  onShowAbout: () => void;
  onShowProduct: (product: string) => void;
  onShowCodeModal: () => void;
  onShowWhyArcus?: () => void;
  onShowFAQ?: () => void;
}

export default function ContactUs({ onClose, onShowComingSoon, onShowAbout, onShowProduct, onShowCodeModal, onShowWhyArcus, onShowFAQ }: ContactUsProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contact-inquiry`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          message,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit inquiry');
      }

      setIsSubmitted(true);
      setFullName('');
      setEmail('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit inquiry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navigation
        onLogoClick={onClose}
        onShowProduct={onShowProduct}
        onHowItWorksClick={onClose}
        onShowWhyArcus={onShowWhyArcus || (() => {})}
        onShowAbout={onShowAbout}
        onShowCodeModal={onShowCodeModal}
      />

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">

          {isSubmitted ? (
            <div className="max-w-2xl mx-auto bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-12 text-center">
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-green-100 rounded-full">
                  <CheckCircle className="w-16 h-16 text-green-600" />
                </div>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Thank You!
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Your message has been received. We'll get back to you as soon as possible.
              </p>
              <button
                onClick={() => setIsSubmitted(false)}
                className="px-8 py-3 bg-slate-700 text-white rounded-full hover:bg-slate-800 transition-all hover:shadow-lg hover:scale-105 font-semibold"
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-12">
                <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
                  Get in Touch
                </h1>
                <p className="text-xl text-gray-600">
                  Have a question or need a quote? Reach out.
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="p-8 md:p-12">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label htmlFor="fullName" className="block text-sm font-semibold text-gray-700 mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        placeholder="John Doe"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="john@example.com"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-sm font-semibold text-gray-700 mb-2">
                        Message
                      </label>
                      <textarea
                        id="message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                        rows={6}
                        placeholder="Tell us what you'd like to discuss..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all resize-none"
                      />
                    </div>

                    {error && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full px-8 py-4 bg-slate-700 text-white rounded-full hover:bg-slate-800 transition-all hover:shadow-lg hover:scale-105 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          Send Message
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <div className="bg-gray-50 px-8 md:px-12 py-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600 text-center">
                    You can also reach us directly at{' '}
                    <a href="mailto:contact@usearcus.ai" className="text-slate-700 hover:text-slate-900 font-semibold">
                      contact@usearcus.ai
                    </a>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer
        onLogoClick={onClose}
        onShowProduct={onShowProduct}
        onShowWhyArcus={onShowWhyArcus || (() => {})}
        onShowAbout={onShowAbout}
        onShowComingSoon={onShowComingSoon}
        onShowContact={() => {}}
        onShowFAQ={onShowFAQ || (() => {})}
      />
    </div>
  );
}
