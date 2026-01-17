import { Sparkles, Target, Users, TrendingUp, Zap, CheckCircle2 } from 'lucide-react';
import { useEffect } from 'react';
import Navigation from './Navigation';
import Footer from './Footer';

interface WhyArcusProps {
  onClose: () => void;
  onShowComingSoon: () => void;
  onShowContact: () => void;
  onShowProduct: (product: string) => void;
  onShowCodeModal: () => void;
  onShowFAQ: () => void;
  onShowAbout: () => void;
}

export default function WhyArcus({ onClose, onShowComingSoon, onShowContact, onShowProduct, onShowCodeModal, onShowFAQ, onShowAbout }: WhyArcusProps) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navigation
        onLogoClick={onClose}
        onShowProduct={onShowProduct}
        onHowItWorksClick={onClose}
        onShowWhyArcus={() => {}}
        onShowAbout={onShowAbout}
        onShowCodeModal={onShowCodeModal}
      />

      <div className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
           Arcus AI vs Current Agency
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            See how Arcus compares to traditional marketing agencies across the metrics that matter most.
          </p>
        </div>
      </div>

      {/* Comparison Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="space-y-12">
            {/* Turnaround Speed */}
            <div className="border-b border-gray-200 pb-12">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Turnaround Speed</h3>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Current Marketing Agency</p>
                  <p className="text-gray-700 leading-relaxed">
                    Slow turnarounds due to multiple approval layers, timezone delays, and resource constraints.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Arcus AI</p>
                  <p className="text-gray-900 leading-relaxed font-medium">
                    Operates 24/7 with no delays - delivering results in hours, not weeks.
                  </p>
                </div>
              </div>
            </div>

            {/* Work Quality */}
            <div className="border-b border-gray-200 pb-12">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Work Quality & Customization</h3>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Current Marketing Agency</p>
                  <p className="text-gray-700 leading-relaxed">
                    Templatized, generic work that looks like everyone else's. Agencies often reuse the same strategies.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Arcus AI</p>
                  <p className="text-gray-900 leading-relaxed font-medium">
                    Tailored strategy & execution built specifically for your brand. Our AI learns to create truly custom campaigns.
                  </p>
                </div>
              </div>
            </div>

            {/* Revisions */}
            <div className="border-b border-gray-200 pb-12">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Revisions & Iterations</h3>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Current Marketing Agency</p>
                  <p className="text-gray-700 leading-relaxed">
                    Charges for revisions after the initial round, creating friction and budget concerns often resulting "good enough".
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Arcus AI</p>
                  <p className="text-gray-900 leading-relaxed font-medium">
                    Unlimited revisions included. Iterate as much as you need without worrying about extra costs.
                  </p>
                </div>
              </div>
            </div>

            {/* Team Quality */}
            <div className="border-b border-gray-200 pb-12">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Team Expertise</h3>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Current Marketing Agency</p>
                  <p className="text-gray-700 leading-relaxed">
                    Junior personnel doing the majority of work while you pay senior rates.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Arcus AI</p>
                  <p className="text-gray-900 leading-relaxed font-medium">
                    AI trained on decades of marketing expertise + only work with senior human talent.
                  </p>
                </div>
              </div>
            </div>

            {/* Accountability */}
            <div className="pb-4">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Accountability & Transparency</h3>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Current Marketing Agency</p>
                  <p className="text-gray-700 leading-relaxed">
                    Blames you for not spending enough when a campaign fails without understanding what's actually working and why.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Arcus AI</p>
                  <p className="text-gray-900 leading-relaxed font-medium">
                    Shows you exactly what failed and tests new angles—free with complete transparency.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 text-center">
            <div className="inline-flex items-center justify-center gap-4 px-8 py-4 bg-slate-50 rounded-2xl border border-slate-200">
              <p className="text-lg text-gray-900 font-semibold">
                Ready to make the switch?
              </p>
              <button
                onClick={onShowCodeModal}
                className="px-6 py-2.5 bg-slate-700 text-white rounded-full hover:bg-slate-800 transition-all hover:shadow-lg hover:scale-105 font-medium"
              >
                Try Arcus
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Comparison Table */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_2fr] gap-12 items-start">
            {/* Left side - Title */}
            <div className="lg:sticky lg:top-32">
              <h2 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
                Speed comparison
              </h2>
            </div>

            {/* Right side - Comparison Table */}
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-4 px-6 text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Feature
                      </th>
                      <th className="text-center py-4 px-6 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        Traditional Agency
                      </th>
                      <th className="text-center py-4 px-6 text-sm font-semibold text-slate-900 uppercase tracking-wide">
                        Arcus AI
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6 text-gray-900 font-medium">
                        Campaign Strategy Development
                      </td>
                      <td className="py-4 px-6 text-center text-gray-700">
                        2-3 weeks
                      </td>
                      <td className="py-4 px-6 text-center text-slate-900 font-semibold">
                        48 hours
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6 text-gray-900 font-medium">
                        Landing Page
                      </td>
                      <td className="py-4 px-6 text-center text-gray-700">
                        2 weeks
                      </td>
                      <td className="py-4 px-6 text-center text-slate-900 font-semibold">
                        Same day
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6 text-gray-900 font-medium">
                        5-Page Website
                      </td>
                      <td className="py-4 px-6 text-center text-gray-700">
                        6-12 weeks
                      </td>
                      <td className="py-4 px-6 text-center text-slate-900 font-semibold">
                        1 week
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6 text-gray-900 font-medium">
                        Video Ad (3x variation)
                      </td>
                      <td className="py-4 px-6 text-center text-gray-700">
                        4 weeks
                      </td>
                      <td className="py-4 px-6 text-center text-slate-900 font-semibold">
                        Same day
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6 text-gray-900 font-medium">
                        Social content
                      </td>
                      <td className="py-4 px-6 text-center text-gray-700">
                        3 weeks
                      </td>
                      <td className="py-4 px-6 text-center text-slate-900 font-semibold">
                        Same day
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

       {/* Cost Comparison Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              No burn on overhead
            </h2>
          </div>

          <div className="grid md:grid-cols-[1fr_auto_1fr] gap-8 items-center max-w-6xl mx-auto">
            {/* Traditional Agency Card */}
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-md">
              <div className="text-center mb-6">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Traditional Agency</p>
                <p className="text-5xl font-bold text-gray-700 mb-1">$940,000</p>
                <p className="text-sm text-gray-500 font-medium">in fees</p>
                <p className="text-xs text-gray-400 mt-2">For $2MM Campaign Budget<br/>6 month campaign</p>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                  <span className="text-gray-600">Account Management</span>
                  <span className="font-semibold text-gray-700">$40,000</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                  <span className="text-gray-600">Project Management</span>
                  <span className="font-semibold text-gray-700">$60,000</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                  <span className="text-gray-600">Media Servicing (12%)</span>
                  <span className="font-semibold text-gray-700">$240,000</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                  <span className="text-gray-600">Creative (340 assets)</span>
                  <span className="font-semibold text-gray-700">$480,000</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-gray-600">Junior employees learning</span>
                  <span className="font-semibold text-gray-500">Bullsh*t</span>
                </div>
              </div>
            </div>

            {/* VS Badge */}
            <div className="hidden md:flex items-center justify-center">
              <div className="bg-slate-700 text-white px-6 py-3 rounded-full font-bold text-lg shadow-lg">
                VS
              </div>
            </div>

            {/* Mobile VS Badge */}
            <div className="md:hidden flex items-center justify-center -my-4">
              <div className="bg-slate-700 text-white px-6 py-3 rounded-full font-bold text-lg shadow-lg">
                VS
              </div>
            </div>

            {/* Arcus Card */}
            <div className="bg-gradient-to-br from-slate-700 to-slate-900 border-2 border-slate-600 rounded-2xl p-8 shadow-2xl transform hover:scale-105 transition-transform duration-300">
              <div className="text-center mb-6">
                <p className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">arcus</p>
                <p className="text-5xl font-bold text-white mb-1">$138,000</p>
                <p className="text-sm text-slate-300 font-medium">in fees</p>
                <p className="text-xs text-slate-400 mt-2">For $2MM Campaign Budget<br/>6 month campaign</p>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center pb-2 border-b border-slate-600">
                  <span className="text-slate-200">Account Management</span>
                  <span className="font-semibold text-emerald-400">$0</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-600">
                  <span className="text-slate-200">Project Management</span>
                  <span className="font-semibold text-emerald-400">$0</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-600">
                  <span className="text-slate-200">Media Servicing (6%)</span>
                  <span className="font-semibold text-white">$120,000</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-600">
                  <span className="text-slate-200">Creative (340 assets)</span>
                  <span className="font-semibold text-white">$18,000</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-slate-200">Work only with Senior Talent</span>
                  <span className="font-semibold text-emerald-400">Priceless ($0)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mt-12">
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Save over <span className="font-bold text-slate-700">$800,000</span> in overhead costs while getting senior-level expertise and faster execution.
            </p>
          </div>
        </div>
      </section>

      <div className="py-20 px-6 bg-gradient-to-br from-slate-700 to-gray-900">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-4xl font-bold mb-6">The Bottom Line</h2>
          <p className="text-xl mb-8 leading-relaxed">
            You can keep juggling 10 different AI tools and hoping your team can make them work together. Or you can get a complete autonomous marketing team that actually understands your business and executes like experts.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://calendar.app.google/bL5Cn6kkYy98fpc46"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3 bg-white text-slate-700 rounded-full hover:bg-gray-100 transition-all hover:shadow-lg hover:scale-105 inline-block font-semibold"
            >
              Book a Call
            </a>
            <button
              onClick={onShowCodeModal}
              className="px-8 py-3 bg-transparent text-white border-2 border-white rounded-full hover:bg-white/10 transition-all hover:shadow-lg hover:scale-105 font-semibold"
            >
              Try Arcus
            </button>
          </div>
        </div>
      </div>

      <Footer
        onLogoClick={onClose}
        onShowProduct={onShowProduct}
        onShowWhyArcus={() => {}}
        onShowAbout={onShowAbout}
        onShowComingSoon={onShowComingSoon}
        onShowContact={onShowContact}
        onShowFAQ={onShowFAQ}
      />
    </div>
  );
}
