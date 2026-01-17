import { Bot, ArrowRight, Target, Palette, Radio, Code, Box, LayoutGrid as Layout, BarChart3, FolderKanban } from 'lucide-react';
import { useEffect } from 'react';
import Navigation from './Navigation';
import Footer from './Footer';

interface AgentsPageProps {
  section?: string | null;
  onNavigateHome: () => void;
  onShowComingSoon: () => void;
  onShowAbout: () => void;
  onShowContact: () => void;
  onNavigateToProduct: (category: string) => void;
  onShowTryArcus: () => void;
  onShowWhyArcus?: () => void;
  onShowFAQ?: () => void;
}

const agentsData = [
  {
    id: 'marketing',
    title: 'Marketing Agents',
    description: 'Strategic marketing powered by AI. Handle everything from campaign strategy to execution, delivering results faster than traditional agencies.',
    agents: ['Strategy Agent', 'Content Marketing Agent', 'Social Media Agent', 'Email Marketing Agent'],
    icon: Target,
    color: 'blue'
  },
  {
    id: 'creative',
    title: 'Creative Agents',
    description: 'Stunning creative work at scale. Combine artistic vision with data-driven insights to produce compelling visuals and copy that converts.',
    agents: ['Creative Director Agent', 'Copywriting Agent', 'Design Agent', 'Video Production Agent'],
    icon: Palette,
    color: 'purple'
  },
  {
    id: 'media',
    title: 'Media Agents',
    description: 'Intelligent media buying and optimization. Maximize your ad spend with real-time optimization and cross-platform campaign management.',
    agents: ['Media Planning Agent', 'Programmatic Agent', 'Performance Marketing Agent', 'Analytics Agent'],
    icon: Radio,
    color: 'green'
  },
  {
    id: 'development',
    title: 'Development Agents',
    description: 'Build and deploy at unprecedented speed. Handle full-stack development, from landing pages to complex web applications.',
    agents: ['Frontend Agent', 'Backend Agent', 'Landing Page Agent', 'DevOps Agent'],
    icon: Code,
    color: 'orange'
  },
  {
    id: 'projectadmin',
    title: 'Project/Admin Agents',
    description: 'Streamline operations and project management. Handle administrative tasks, project coordination, and workflow automation seamlessly.',
    agents: ['Project Management Agent', 'Resource Allocation Agent', 'Workflow Automation Agent', 'Team Coordination Agent'],
    icon: FolderKanban,
    color: 'slate',
  },
  {
    id: 'uiux',
    title: 'UI/UX Agents',
    description: 'Design that delights and converts. Create beautiful, intuitive interfaces backed by research and testing.',
    agents: ['UX Research Agent', 'UI Design Agent', 'Interaction Design Agent', 'CRO Agent'],
    icon: Layout,
    color: 'pink'
  },
  {
    id: 'analytics',
    title: 'Analytics Agents',
    description: 'Data-driven insights and intelligence. Track, measure, and optimize every aspect of your marketing performance with AI-powered analytics.',
    agents: ['Performance Analytics Agent', 'Attribution Agent', 'Predictive Analytics Agent', 'Reporting Agent'],
    icon: BarChart3,
    color: 'slate',
    comingSoon: true
  },
  {
    id: 'spatial',
    title: 'Spatial Computing Agents',
    description: 'The future of immersive experiences. Create AR/VR experiences and spatial computing applications for next-generation platforms.',
    agents: ['3D Environment Agent', 'AR Experience Agent', 'VR Agent', 'Spatial UX Agent'],
    icon: Box,
    color: 'cyan',
    comingSoon: true
  }
];

export default function AgentsPage({
  section,
  onNavigateHome,
  onShowComingSoon,
  onShowAbout,
  onShowContact,
  onNavigateToProduct,
  onShowTryArcus,
  onShowWhyArcus,
  onShowFAQ
}: AgentsPageProps) {

  useEffect(() => {
    if (section) {
      const element = document.getElementById(section);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [section]);

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-50 text-blue-600',
      purple: 'bg-purple-50 text-purple-600',
      green: 'bg-green-50 text-green-600',
      orange: 'bg-orange-50 text-orange-600',
      cyan: 'bg-cyan-50 text-cyan-600',
      pink: 'bg-pink-50 text-pink-600',
      slate: 'bg-slate-50 text-slate-600'
    };
    return colors[color as keyof typeof colors] || colors.slate;
  };

  return (
    <div className="min-h-screen bg-white">
      <Navigation
        onLogoClick={onNavigateHome}
        onShowProduct={onNavigateToProduct}
        onHowItWorksClick={onNavigateHome}
        onShowWhyArcus={onShowWhyArcus}
        onShowAbout={onShowAbout}
        onShowCodeModal={onShowTryArcus}
      />

      <section className="pt-32 pb-16 px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full mb-6">
            <Bot className="w-4 h-4" />
            <span className="text-sm">25+ Specialized AI Agents</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-gray-900 mb-4 leading-tight">
            Meet Your AI Marketing Team
          </h1>
          <p className="text-lg text-gray-500 max-w-3xl mx-auto leading-relaxed">
            Every agent is specialized, trained by industry veterans, and ready to transform your marketing operations.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-16">
        {agentsData.map((category) => {
          const IconComponent = category.icon;
          return (
            <section
              key={category.id}
              id={category.id}
              className={`scroll-mt-24 ${category.comingSoon ? 'opacity-50' : ''}`}
            >
              <div className="mb-8">
                <div className="flex items-center gap-4 mb-3">
                  <div className={`w-12 h-12 ${getColorClasses(category.color)} rounded-xl flex items-center justify-center`}>
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl md:text-3xl font-semibold text-gray-800">
                      {category.title}
                    </h2>
                    {category.comingSoon && (
                      <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-full">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-base text-gray-500 leading-relaxed max-w-3xl ml-16">
                  {category.description}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 ml-16">
                {category.agents.map((agent, idx) => (
                  <div
                    key={idx}
                    className={`bg-white border border-gray-100 rounded-lg px-4 py-3 transition-all duration-200 ${!category.comingSoon ? 'hover:border-gray-300 hover:shadow-sm' : ''}`}
                  >
                    <p className="text-sm text-gray-700">
                      {agent}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="py-20 px-6 bg-slate-700 mt-12">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-white mb-4">
            Ready to Work with These Agents?
          </h2>
          <p className="text-lg text-slate-200 mb-10">
            See how Arcus can transform your marketing operations
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <a
              href="https://calendar.app.google/bL5Cn6kkYy98fpc46"
              target="_blank"
              rel="noopener noreferrer"
              className="group px-8 py-3 bg-white text-slate-700 rounded-full hover:shadow-xl transition-all hover:scale-105 flex items-center space-x-2"
            >
              <span>Book a Call</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <button
              onClick={onShowTryArcus}
              className="px-8 py-3 bg-transparent text-white rounded-full border-2 border-white/30 hover:bg-white/10 transition-all"
            >
              Try Arcus
            </button>
          </div>
        </div>
      </section>

      <Footer
        onLogoClick={onNavigateHome}
        onShowProduct={onNavigateToProduct}
        onShowWhyArcus={onShowWhyArcus}
        onShowAbout={onShowAbout}
        onShowComingSoon={onShowComingSoon}
        onShowContact={onShowContact}
        onShowFAQ={onShowFAQ}
      />
    </div>
  );
}
