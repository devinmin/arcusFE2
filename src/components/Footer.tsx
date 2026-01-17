interface FooterProps {
  onLogoClick: () => void;
  onShowProduct: (product: string) => void;
  onShowWhyArcus: () => void;
  onShowAbout: () => void;
  onShowComingSoon: () => void;
  onShowContact: () => void;
  onShowFAQ: () => void;
}

export default function Footer({
  onLogoClick,
  onShowProduct,
  onShowWhyArcus,
  onShowAbout,
  onShowComingSoon,
  onShowContact,
  onShowFAQ
}: FooterProps) {
  return (
    <footer className="py-12 px-6 bg-gray-900">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_.5fr] gap-8 mb-8">
          <div>
            <div className="mb-4">
              <button onClick={onLogoClick} className="cursor-pointer">
                <img src="/arcusai.png" alt="Arcus AI" className="h-8 brightness-0 invert" />
              </button>
            </div>
            <p className="text-gray-400">
              Your autonomous marketing team, powered by AI
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Agents</h4>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-2">
              <li><button onClick={() => onShowProduct('marketing')} className="text-gray-400 hover:text-white transition-colors text-left">Marketing</button></li>
              <li><button onClick={() => onShowProduct('media')} className="text-gray-400 hover:text-white transition-colors text-left">Media</button></li>
              <li><button onClick={() => onShowProduct('creative')} className="text-gray-400 hover:text-white transition-colors text-left">Creative</button></li>
              <li><button onClick={() => onShowProduct('projectadmin')} className="text-gray-400 hover:text-white transition-colors text-left flex items-center gap-2">Project/Admin</button></li>
              <li><button onClick={() => onShowProduct('uiux')} className="text-gray-400 hover:text-white transition-colors text-left">UI/UX</button></li>
              <li><button onClick={() => onShowProduct('development')} className="text-gray-400 hover:text-white transition-colors text-left">Development</button></li>
              <li><button onClick={() => onShowProduct('analytics')} className="text-gray-400 hover:text-white transition-colors text-left flex items-center gap-2">Analytics <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full whitespace-nowrap">Coming Soon</span></button></li>
               <li><button onClick={() => onShowProduct('spatial')} className="text-gray-400 hover:text-white transition-colors text-left">Spatial <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full whitespace-nowrap">Coming Soon</span></button></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-2">
              <li><button onClick={onShowWhyArcus} className="text-gray-400 hover:text-white transition-colors text-left">Why Arcus</button></li>
              <li><button onClick={onShowAbout} className="text-gray-400 hover:text-white transition-colors text-left">About</button></li>
              <li><button onClick={onShowComingSoon} className="text-gray-400 hover:text-white transition-colors text-left">Blog</button></li>
               <li><button onClick={onShowFAQ} className="text-gray-400 hover:text-white transition-colors text-left">FAQ</button></li>
              <li><button onClick={onShowContact} className="text-gray-400 hover:text-white transition-colors text-left">Contact</button></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © 2026 Arcus AI. All rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Privacy Policy</a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
