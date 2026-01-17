import { Linkedin, Mail } from 'lucide-react';
import { useEffect } from 'react';
import Navigation from './Navigation';
import Footer from './Footer';

interface AboutProps {
  onClose: () => void;
  onShowComingSoon: () => void;
  onShowContact: () => void;
  onShowProduct: (product: string) => void;
  onShowCodeModal: () => void;
  onShowWhyArcus?: () => void;
  onShowFAQ?: () => void;
}

export default function About({ onClose, onShowComingSoon, onShowContact, onShowProduct, onShowCodeModal, onShowWhyArcus, onShowFAQ }: AboutProps) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navigation
        onLogoClick={onClose}
        onShowProduct={onShowProduct}
        onHowItWorksClick={onClose}
        onShowWhyArcus={onShowWhyArcus || (() => {})}
        onShowAbout={() => {}}
        onShowCodeModal={onShowCodeModal}
      />

            <div className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
         <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-4">
            Full Marketing.
            <br />
            20% of the Staff.
          </h1>
          <p className="text-xl text-gray-600">We strive to build a better world for marketing</p>
        </div>
      </div>

      <div className="py-16 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">Why did we build this?</h2>
              <div className="prose prose-lg text-gray-700 space-y-4">
                               <p className="text-lg leading-relaxed">
                  <span className="font-semibold">First, hiring was a nightmare.</span> Finding great marketers takes 3-6 months. Training them takes another 6. And when they leave, you start over.
                </p>
                <p className="text-lg leading-relaxed">
                  <span className="font-semibold">Second, AI worked - but it was scattered.</span> We'd use one tool for copy, another for creative, 8 other tools for research, scheduling, and reporting. Every campaign required duct-taping 10 platforms together.
                </p>
                <p className="text-lg leading-relaxed">
                  So we building one system that does all of it. And we figured out how to download our brains into the AIs so it could think and produce based on knowledge of what actually works and what doesn't.
                </p>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-2xl">
              <img
                src="https://images.pexels.com/photos/3184325/pexels-photo-3184325.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Frustrated marketer"
                className="w-full h-96 object-cover"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div className="rounded-2xl overflow-hidden shadow-2xl order-2 md:order-1">
              <img
                src="https://images.pexels.com/photos/7598012/pexels-photo-7598012.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Brand campaign"
                className="w-full h-96 object-cover"
              />
            </div>
            <div className="order-1 md:order-2">
              <h2 className="text-4xl font-bold text-gray-900 mb-6">What Problem Do We Want to Solve?</h2>
              <div className="prose prose-lg text-gray-700 space-y-4">
                <p className="text-lg leading-relaxed">
                  Good marketers are expensive and hard to scale. You can't clone your best strategist. You can't afford 5 of them.
                </p>
                <p className="text-lg leading-relaxed">
                  We wanted to create a system where one great marketer, augmented by AI, can output what used to require an entire team.
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">Who Are We?</h2>
              <div className="prose prose-lg text-gray-700 space-y-4">
  <p className="text-lg leading-relaxed">
                  Marketers, AI engineers, and product developers with 40+ years combined experience across OMD, Publicis, WPP, and brands like SoFi. We've been CMOs, built products for Fortune 500s and startups, and worked across CPG, fintech, entertainment, and gaming.
                </p>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-2xl">
              <img
                src="https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Team"
                className="w-full h-96 object-cover"
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-12 border border-gray-100">
            <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Now you have two options:</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-gray-50 rounded-2xl p-8 border-2 border-gray-200">
                <div className="text-6xl mb-4">😓</div>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Keep searching for a unicorn, hoping they stay, and paying $80K-$150K per head
                </p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-8 border-2 border-slate-700">
                <div className="text-6xl mb-4">🚀</div>
                <p className="text-lg text-gray-900 leading-relaxed font-medium">
                  Let AI be your unicorn by handling 90% of work while your best people focus on the 10% that actually moves the needle.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">Meet Our Founders</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="w-32 h-32 rounded-full mx-auto overflow-hidden">
                <img
                  src="/1754614138091.png"
                  alt="Jordan Chen"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Nazeem Ahmed</h3>
                <p className="text-gray-600">Co-Founder</p>
              </div>
              <p className="text-gray-700 text-sm">
                Former Marketing exec in banking, big tech, and AI. Expert in multi-agent systems and NLP.
              </p>
              <button onClick={() =>
    window.open(
      "https://www.linkedin.com/in/nazeemahmed/",
      "_blank",
      "noopener,noreferrer"
    )
  } className="text-gray-400 hover:text-gray-600 transition-colors">
                <Linkedin className="w-5 h-5 mx-auto" />
              </button>
            </div>

            <div className="text-center space-y-4">
              <div className="w-32 h-32 rounded-full mx-auto overflow-hidden">
                <img
                  src="/1751890423851.png"
                  alt="Alex Rivera"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Min Je Kwak</h3>
                <p className="text-gray-600">Co-Founder</p>
              </div>
              <p className="text-gray-700 text-sm">
                Led marketing in media & analytics. Worked with different brands and media in different brand lifecycles.
              </p>
              <button   onClick={() =>
    window.open(
      "https://www.linkedin.com/in/min-je-kwak-a8731117/",
      "_blank",
      "noopener,noreferrer"
    )
  } className="text-gray-400 hover:text-gray-600 transition-colors">
                <Linkedin className="w-5 h-5 mx-auto"/>
              </button>
            </div>

            <div className="text-center space-y-4">
              <div className="w-32 h-32 rounded-full mx-auto overflow-hidden">
                <img
                  src="/1703046610447.jpeg"
                  alt="Maya Patel"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Devin Min</h3>
                <p className="text-gray-600">Co-Founder</p>
              </div>
              <p className="text-gray-700 text-sm">
                12+ years building products in different verticals - recently, automation platforms at scale.
              </p>
              <button onClick={() =>
    window.open(
      "https://www.linkedin.com/in/devinmin/",
      "_blank",
      "noopener,noreferrer"
    )
  } className="text-gray-400 hover:text-gray-600 transition-colors">
                <Linkedin className="w-5 h-5 mx-auto" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="py-20 px-6 bg-gradient-to-br from-slate-50 to-gray-100">
        <div className="max-w-4xl mx-auto text-center">
          <Mail className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Join us in building the future</h2>
          <p className="text-xl text-gray-600 mb-8">
            We're always looking for talented people who want to make an impact.
          </p>
          <a
            href="mailto:opportunities@userarcus.ai"
            className="inline-block px-8 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors"
          >
            Reach Out
          </a>
        </div>
      </div>

      <Footer
        onLogoClick={onClose}
        onShowProduct={onShowProduct}
        onShowWhyArcus={onShowWhyArcus || (() => {})}
        onShowAbout={() => {}}
        onShowComingSoon={onShowComingSoon}
        onShowContact={onShowContact}
        onShowFAQ={onShowFAQ || (() => {})}
      />
    </div>
  );
}
