import { ArrowRight, Bot, Sparkles, Target, TrendingUp, Zap, CheckCircle2 } from 'lucide-react';
import Navigation from './Navigation';
import Footer from './Footer';

interface ProductPageProps {
  category: 'marketing' | 'creative' | 'media' | 'development' | 'spatial' | 'uiux';
  onNavigateHome: () => void;
  onShowComingSoon: () => void;
  onShowAbout: () => void;
  onShowContact: () => void;
  onNavigateToProduct: (category: string) => void;
  onShowTryArcus: () => void;
  onShowWhyArcus?: () => void;
  onShowFAQ?: () => void;
}

const productData = {
  marketing: {
    title: 'Marketing AI Agents',
    subtitle: 'Strategic marketing powered by AI',
    description: 'Arcus Marketing agents handle everything from campaign strategy to execution, delivering results faster than traditional agencies.',
    hero: 'https://images.pexels.com/photos/7688336/pexels-photo-7688336.jpeg?auto=compress&cs=tinysrgb&w=1200',
    agents: [
      {
        name: 'Strategy Agent',
        description: 'Analyzes market trends, competitors, and audience data to create comprehensive marketing strategies',
        capabilities: ['Market Analysis', 'Competitor Research', 'Audience Segmentation', 'Campaign Planning']
      },
      {
        name: 'Content Marketing Agent',
        description: 'Creates and manages content calendars, blog posts, whitepapers, and thought leadership pieces',
        capabilities: ['SEO Optimization', 'Content Calendar', 'Blog Writing', 'Lead Magnets']
      },
      {
        name: 'Social Media Agent',
        description: 'Manages social presence across all platforms with consistent brand voice and engagement',
        capabilities: ['Multi-platform Posting', 'Engagement Management', 'Trend Monitoring', 'Community Building']
      },
      {
        name: 'Email Marketing Agent',
        description: 'Designs, writes, and optimizes email campaigns with A/B testing and personalization',
        capabilities: ['Campaign Design', 'List Segmentation', 'A/B Testing', 'Automation Flows']
      }
    ]
  },
  creative: {
    title: 'Creative AI Agents',
    subtitle: 'Stunning creative work at scale',
    description: 'Our creative agents combine artistic vision with data-driven insights to produce compelling visuals and copy that converts.',
    hero: 'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=1200',
    agents: [
      {
        name: 'Creative Director Agent',
        description: 'Oversees all creative output, ensures brand consistency, and maintains high creative standards',
        capabilities: ['Brand Guidelines', 'Creative Strategy', 'Quality Control', 'Art Direction']
      },
      {
        name: 'Copywriting Agent',
        description: 'Crafts compelling copy for ads, landing pages, and marketing materials',
        capabilities: ['Ad Copy', 'Landing Pages', 'Product Descriptions', 'Brand Messaging']
      },
      {
        name: 'Design Agent',
        description: 'Creates visual assets including graphics, banners, and social media visuals',
        capabilities: ['Graphic Design', 'Social Assets', 'Banner Ads', 'Infographics']
      },
      {
        name: 'Video Production Agent',
        description: 'Produces video content from concept to final edit for multiple platforms',
        capabilities: ['Video Editing', 'Motion Graphics', 'Storyboarding', 'Platform Optimization']
      }
    ]
  },
  media: {
    title: 'Media AI Agents',
    subtitle: 'Intelligent media buying and optimization',
    description: 'Arcus Media agents maximize your ad spend with real-time optimization and cross-platform campaign management.',
    hero: 'https://images.pexels.com/photos/6476589/pexels-photo-6476589.jpeg?auto=compress&cs=tinysrgb&w=1200',
    agents: [
      {
        name: 'Media Planning Agent',
        description: 'Develops comprehensive media plans across channels with budget allocation and timing',
        capabilities: ['Channel Selection', 'Budget Allocation', 'Reach Planning', 'Frequency Optimization']
      },
      {
        name: 'Programmatic Agent',
        description: 'Manages programmatic ad buying with real-time bidding and audience targeting',
        capabilities: ['RTB Management', 'Audience Targeting', 'Bid Optimization', 'Inventory Selection']
      },
      {
        name: 'Performance Marketing Agent',
        description: 'Optimizes campaigns for conversions with continuous testing and refinement',
        capabilities: ['Conversion Tracking', 'Performance Analysis', 'ROI Optimization', 'Attribution Modeling']
      },
      {
        name: 'Analytics Agent',
        description: 'Tracks, analyzes, and reports on campaign performance across all channels',
        capabilities: ['Multi-channel Tracking', 'Custom Dashboards', 'Predictive Analytics', 'Reporting Automation']
      }
    ]
  },
  development: {
    title: 'Development AI Agents',
    subtitle: 'Build and deploy at unprecedented speed',
    description: 'Our development agents handle full-stack development, from landing pages to complex web applications.',
    hero: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=1200',
    agents: [
      {
        name: 'Frontend Agent',
        description: 'Builds responsive, performant user interfaces with modern frameworks',
        capabilities: ['React/Vue Development', 'Responsive Design', 'Performance Optimization', 'Cross-browser Testing']
      },
      {
        name: 'Backend Agent',
        description: 'Develops robust APIs and server-side logic with scalability in mind',
        capabilities: ['API Development', 'Database Design', 'Authentication', 'Server Optimization']
      },
      {
        name: 'Landing Page Agent',
        description: 'Creates high-converting landing pages optimized for campaigns',
        capabilities: ['A/B Testing', 'Conversion Optimization', 'Fast Deployment', 'Analytics Integration']
      },
      {
        name: 'DevOps Agent',
        description: 'Handles deployment, monitoring, and infrastructure management',
        capabilities: ['CI/CD Pipelines', 'Cloud Infrastructure', 'Monitoring', 'Security Audits']
      }
    ]
  },
  spatial: {
    title: 'Spatial Computing AI Agents',
    subtitle: 'The future of immersive experiences',
    description: 'Arcus Spatial agents create AR/VR experiences and spatial computing applications for next-generation platforms.',
    hero: 'https://images.pexels.com/photos/8728382/pexels-photo-8728382.jpeg?auto=compress&cs=tinysrgb&w=1200',
    agents: [
      {
        name: '3D Environment Agent',
        description: 'Creates immersive 3D environments and virtual spaces',
        capabilities: ['3D Modeling', 'Environment Design', 'Lighting & Effects', 'Optimization']
      },
      {
        name: 'AR Experience Agent',
        description: 'Develops augmented reality experiences for mobile and wearable devices',
        capabilities: ['AR Development', 'Object Tracking', 'Spatial Mapping', 'Interactive Elements']
      },
      {
        name: 'VR Agent',
        description: 'Builds fully immersive virtual reality experiences and applications',
        capabilities: ['VR Development', 'Interaction Design', 'Performance Optimization', 'Multi-platform Support']
      },
      {
        name: 'Spatial UX Agent',
        description: 'Designs intuitive interactions for 3D and spatial computing interfaces',
        capabilities: ['Spatial Design', 'Gesture Controls', 'Voice Integration', 'User Testing']
      }
    ]
  },
  uiux: {
    title: 'UI/UX AI Agents',
    subtitle: 'Design that delights and converts',
    description: 'Our UI/UX agents create beautiful, intuitive interfaces backed by research and testing.',
    hero: 'https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg?auto=compress&cs=tinysrgb&w=1200',
    agents: [
      {
        name: 'UX Research Agent',
        description: 'Conducts user research, competitive analysis, and usability testing',
        capabilities: ['User Interviews', 'Usability Testing', 'Competitive Analysis', 'Journey Mapping']
      },
      {
        name: 'UI Design Agent',
        description: 'Creates beautiful, consistent interfaces with modern design systems',
        capabilities: ['Design Systems', 'Component Libraries', 'Responsive Design', 'Prototyping']
      },
      {
        name: 'Interaction Design Agent',
        description: 'Designs smooth, intuitive interactions and micro-animations',
        capabilities: ['Animation Design', 'Interaction Patterns', 'Micro-interactions', 'Accessibility']
      },
      {
        name: 'CRO Agent',
        description: 'Optimizes user flows and interfaces for maximum conversion',
        capabilities: ['A/B Testing', 'Heatmap Analysis', 'Funnel Optimization', 'Form Optimization']
      }
    ]
  }
};

export default function ProductPage({ category, onNavigateHome, onShowComingSoon, onShowAbout, onShowContact, onNavigateToProduct, onShowTryArcus, onShowWhyArcus, onShowFAQ }: ProductPageProps) {
  const product = productData[category];

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

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-full mb-6">
                <Bot className="w-4 h-4" />
                <span className="text-sm font-medium">AI-Powered {product.title.split(' ')[0]}</span>
              </div>
              <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                {product.title}
              </h1>
              <p className="text-xl text-gray-600 mb-4 leading-relaxed">
                {product.subtitle}
              </p>
              <p className="text-lg text-gray-600 mb-8">
                {product.description}
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                <a
                  href="https://calendar.app.google/bL5Cn6kkYy98fpc46"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group px-8 py-4 bg-slate-700 text-white rounded-full font-medium hover:bg-slate-800 transition-all hover:shadow-xl hover:scale-105 flex items-center space-x-2"
                >
                  <span>Book a Call</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </a>
              </div>
            </div>
            <div>
              <img
                src={product.hero}
                alt={product.title}
                className="rounded-2xl shadow-2xl w-full h-[500px] object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Agents Section */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Meet Your AI Team
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Specialized agents working together to deliver exceptional results
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {product.agents.map((agent, index) => (
              <div
                key={index}
                className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start space-x-4 mb-6">
                  <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{agent.name}</h3>
                    <p className="text-gray-600 leading-relaxed">{agent.description}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Key Capabilities:</p>
                  {agent.capabilities.map((capability, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-slate-700 flex-shrink-0" />
                      <span className="text-gray-600">{capability}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Why Choose Arcus
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center mb-6">
                <Zap className="w-7 h-7 text-slate-700" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Lightning Fast</h3>
              <p className="text-gray-600 leading-relaxed">
                Deploy campaigns in hours, not weeks. Our AI agents work 24/7 to deliver results at unprecedented speed.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center mb-6">
                <Target className="w-7 h-7 text-slate-700" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Senior-Level Expertise</h3>
              <p className="text-gray-600 leading-relaxed">
                Every agent is trained by industry veterans. No junior staff, no learning on your dime.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center mb-6">
                <TrendingUp className="w-7 h-7 text-slate-700" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Cost Effective</h3>
              <p className="text-gray-600 leading-relaxed">
                Save up to 85% compared to traditional agencies while getting better results and faster turnaround.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-slate-700">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-5xl font-bold text-white mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-slate-100 mb-10">
            See how Arcus can transform your {product.title.split(' ')[0].toLowerCase()} operations
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <a
              href="https://calendar.app.google/bL5Cn6kkYy98fpc46"
              target="_blank"
              rel="noopener noreferrer"
              className="group px-8 py-4 bg-white text-slate-700 rounded-full font-medium hover:shadow-2xl transition-all hover:scale-105 flex items-center space-x-2"
            >
              <span>Book a Call</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
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
