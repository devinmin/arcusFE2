import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

interface NavigationProps {
  onLogoClick: () => void;
  onShowProduct: (product: string) => void;
  onHowItWorksClick: () => void;
  onShowWhyArcus: () => void;
  onShowAbout: () => void;
  onShowCodeModal: () => void;
}

export default function Navigation({
  onLogoClick,
  onShowProduct,
  onHowItWorksClick,
  onShowWhyArcus,
  onShowAbout,
  onShowCodeModal
}: NavigationProps) {
  const [scrolled, setScrolled] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <nav className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="grid grid-cols-[1fr,auto,1fr] items-center">
            <div className="justify-self-start">
  <button onClick={onLogoClick}>
    <img src="/arcusai.png" alt="Arcus AI" className="h-8" />
  </button>
</div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex justify-self-center items-center space-x-8">
              <div
                className="relative"
                onMouseEnter={() => setShowProductDropdown(true)}
                onMouseLeave={() => setShowProductDropdown(false)}
              >
                <button className="text-gray-600 hover:text-gray-900 transition-colors py-2">
                  Agents
                </button>
                {showProductDropdown && (
                  <div className="absolute top-full left-0 pt-2 w-64">
                    <div className="bg-white rounded-xl shadow-xl border border-gray-100 py-2">
                      <button onClick={() => { onShowProduct('marketing'); setShowProductDropdown(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors">
                        Marketing
                      </button>
                      <button onClick={() => { onShowProduct('creative'); setShowProductDropdown(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors">
                        Creative
                      </button>
                      <button onClick={() => { onShowProduct('media'); setShowProductDropdown(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors">
                        Media
                      </button>
                      <button onClick={() => { onShowProduct('development'); setShowProductDropdown(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors">
                        Development
                      </button>
                      <button onClick={() => { onShowProduct('projectadmin'); setShowProductDropdown(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors">
                        Project/Admin
                      </button>
                      <button onClick={() => { onShowProduct('uiux'); setShowProductDropdown(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors">
                        UI/UX
                      </button>
                      <div className="border-t border-gray-100 my-2"></div>
                      <button onClick={() => { onShowProduct('analytics'); setShowProductDropdown(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors flex items-center justify-between gap-2">
                        <span>Analytics</span>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">Coming Soon</span>
                      </button>
                      <button onClick={() => { onShowProduct('spatial'); setShowProductDropdown(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-colors flex items-center justify-between gap-2">
                        <span>Spatial</span>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">Coming Soon</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={onShowWhyArcus} className="text-gray-600 hover:text-gray-900 transition-colors">Why Arcus</button>
              <button onClick={onShowAbout} className="text-gray-600 hover:text-gray-900 transition-colors">About</button>
            </div>

            <div className="hidden md:flex justify-self-end items-center space-x-4">
              <a
                href="https://calendar.app.google/bL5Cn6kkYy98fpc46"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-2.5 bg-slate-700 text-white rounded-full hover:bg-slate-800 transition-all hover:shadow-lg hover:scale-105 inline-block"
              >
                Book a Call
              </a>
              <button
                onClick={onShowCodeModal}
                className="px-6 py-2.5 bg-white text-slate-700 border-2 border-slate-700 rounded-full hover:bg-slate-50 transition-all hover:shadow-lg hover:scale-105"
              >
                Try Arcus
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden justify-self-end col-start-3">
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              {showMobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
              </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)} />
          <div className="fixed top-20 left-0 right-0 bg-white shadow-xl border-b border-gray-200 max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2">Agents</p>
                <button onClick={() => { onShowProduct('marketing'); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  Marketing
                </button>
                <button onClick={() => { onShowProduct('creative'); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  Creative
                </button>
                <button onClick={() => { onShowProduct('media'); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  Media
                </button>
                <button onClick={() => { onShowProduct('development'); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  Development
                </button>
                <button onClick={() => { onShowProduct('projectadmin'); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  Project/Admin
                </button>
                <button onClick={() => { onShowProduct('uiux'); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  UI/UX
                </button>
                <button onClick={() => { onShowProduct('analytics'); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-between">
                  <span>Analytics</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Coming Soon</span>
                </button>
                <button onClick={() => { onShowProduct('spatial'); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-between">
                  <span>Spatial</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Coming Soon</span>
                </button>
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-2">
                <button onClick={() => { onShowWhyArcus(); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  Why Arcus
                </button>
                <button onClick={() => { onShowAbout(); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  About
                </button>
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-3">
                <a
                  href="https://calendar.app.google/bL5Cn6kkYy98fpc46"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full px-6 py-3 bg-slate-700 text-white text-center rounded-full hover:bg-slate-800 transition-all"
                >
                  Book a Call
                </a>
                <button
                  onClick={() => { onShowCodeModal(); setShowMobileMenu(false); }}
                  className="block w-full px-6 py-3 bg-white text-slate-700 text-center border-2 border-slate-700 rounded-full hover:bg-slate-50 transition-all"
                >
                  Try Arcus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
