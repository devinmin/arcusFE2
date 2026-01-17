import { FileText, Image, Mail, MessageSquare, Video, Megaphone, Download, RefreshCw, Home, Presentation, Edit } from 'lucide-react';
import { useState } from 'react';
import { CampaignResult, downloadAllCampaign, downloadDeliverable } from '../lib/api';
import { VideoPlayer } from './VideoPlayer';
import { PowerPointDownload } from './PowerPointDownload';
import { BrandIntelligence } from './BrandIntelligence';
import { StrategicBriefView } from './StrategicBriefView';
import { SocialMediaView } from './SocialMediaView';
import { EmailSequenceView } from './EmailSequenceView';
import { BlogArticleView } from './BlogArticleView';
import { AdCopyView } from './AdCopyView';
import { VideoScriptView } from './VideoScriptView';
import { BrandEditModal, BrandEditData } from './BrandEditModal';
import { supabase } from '../lib/supabase';
import { refineDeliverable } from '../lib/refine';

interface CampaignResultsProps {
  url: string;
  industry: string;
  data: CampaignResult | null;
  onRetry: () => void;
  onSignOut?: () => void;
}

export function CampaignResults({ url, industry, data, onRetry, onSignOut }: CampaignResultsProps) {
  const [selectedTab, setSelectedTab] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showBrandEditModal, setShowBrandEditModal] = useState(false);
  const [editedBrandData, setEditedBrandData] = useState<{ json: string; guidelines: string } | null>(null);
  const [editedContent, setEditedContent] = useState<{ [key: string]: string }>({});

  const results = [
    {
      icon: Home,
      title: 'Brand Overview',
      description: 'Extracted brand data, colors, fonts, and visual assets',
      preview: 'Complete brand analysis with color palette, typography, voice analysis...',
      color: 'slate',
      gradient: 'from-slate-500 to-slate-600',
      badge: 'JSON',
      isBrandIntelligence: true,
      brandData: {
        json: editedBrandData?.json || data?.deliverables.brandContext.json || null,
        extractedImages: data?.deliverables.brandContext.extractedImages || [],
        guidelines: editedBrandData?.guidelines || data?.deliverables.brandContext.colorsAndFonts || null,
      },
      content: editedBrandData?.guidelines || data?.deliverables.brandContext.colorsAndFonts || 'Content not available',
    },
    {
      icon: FileText,
      title: 'Strategic Brief',
      description: 'Comprehensive marketing strategy and campaign overview',
      preview: 'Brand positioning, target audience analysis, key messaging pillars...',
      color: 'blue',
      gradient: 'from-blue-500 to-blue-600',
      badge: 'PDF',
      isStrategicBrief: true,
      content: data?.deliverables.strategicBrief || 'Content not available',
    },
    {
      icon: MessageSquare,
      title: 'Social Media',
      description: '15 ready-to-publish posts across platforms',
      preview: 'Instagram, Facebook, Twitter, LinkedIn content with hashtags...',
      color: 'teal',
      gradient: 'from-teal-500 to-teal-600',
      badge: '15 Posts',
      isSocialMedia: true,
      content: data?.deliverables.socialMedia || 'Content not available',
    },
    {
      icon: Mail,
      title: 'Email Sequence',
      description: '5-part email campaign with subject lines',
      preview: 'Welcome email, value proposition, social proof, offer, follow-up...',
      color: 'green',
      gradient: 'from-green-500 to-green-600',
      badge: '5 Emails',
      isEmailSequence: true,
      content: data?.deliverables.emailSequence || 'Content not available',
    },
    {
      icon: FileText,
      title: 'Blog Article',
      description: 'SEO-optimized long-form content',
      preview: '2,000+ word article with meta description and keywords...',
      color: 'orange',
      gradient: 'from-orange-500 to-orange-600',
      badge: '2,000 words',
      isBlogArticle: true,
      content: data?.deliverables.blogArticle || 'Content not available',
    },
    {
      icon: Megaphone,
      title: 'Ad Copy',
      description: 'Multiple ad variations for different platforms',
      preview: 'Google Ads, Facebook Ads, LinkedIn Ads with CTAs...',
      color: 'red',
      gradient: 'from-red-500 to-red-600',
      badge: '12 Variations',
      isAdCopy: true,
      content: data?.deliverables.adCopy || 'Content not available',
    },
    {
      icon: Video,
      title: 'Hero Video',
      description: '30-second promotional video',
      preview: 'Complete video with scenes, voiceover, and music...',
      color: 'sky',
      gradient: 'from-sky-500 to-sky-600',
      badge: data?.deliverables.video.duration ? `${data.deliverables.video.duration}s` : 'Script',
      isVideo: data?.deliverables.video.url ? true : false,
      isVideoScript: !data?.deliverables.video.url && data?.deliverables.videoScript ? true : false,
      videoUrl: data?.deliverables.video.url || null,
      thumbnail: data?.deliverables.video.thumbnail || null,
      content: data?.deliverables.videoScript || 'Content not available',
    },
    {
      icon: Image,
      title: 'Generated Images',
      description: 'AI-generated visuals for your campaign',
      preview: 'Hero images, social media graphics, ad creatives...',
      color: 'pink',
      gradient: 'from-pink-500 to-pink-600',
      badge: `${Object.values(data?.deliverables.images || {}).filter(Boolean).length} Images`,
      isImageGallery: true,
      images: [
        {
          title: 'Hero Image',
          dimensions: '1920x1080px',
          format: 'PNG',
          style: 'Website/landing page use',
          useCase: 'Homepage, hero sections',
          url: data?.deliverables.images.hero,
        },
        {
          title: 'Social Media Post',
          dimensions: '1080x1080px',
          format: 'PNG',
          style: 'Instagram/Facebook post',
          useCase: 'Feed posts, carousels',
          url: data?.deliverables.images.socialPost,
        },
        {
          title: 'Social Media Story',
          dimensions: '1080x1920px',
          format: 'PNG',
          style: 'Instagram/Facebook story',
          useCase: 'Stories, Reels',
          url: data?.deliverables.images.socialStory,
        },
        {
          title: 'Email Banner',
          dimensions: '600x200px',
          format: 'PNG',
          style: 'Email header',
          useCase: 'Email campaigns',
          url: data?.deliverables.images.emailBanner,
        },
        {
          title: 'Ad Creative',
          dimensions: '1200x628px',
          format: 'PNG',
          style: 'Facebook/LinkedIn ad',
          useCase: 'Paid social advertising',
          url: data?.deliverables.images.adCreative,
        },
        {
          title: 'Blog Featured Image',
          dimensions: '1200x630px',
          format: 'PNG',
          style: 'Blog post header',
          useCase: 'Blog articles, SEO',
          url: data?.deliverables.images.blogFeatured,
        },
      ].filter(img => img.url),
      content: '',
    },
    {
      icon: Presentation,
      title: 'Campaign Deck',
      description: 'Professional PowerPoint presentation',
      preview: 'Complete client-ready deck with all deliverables...',
      color: 'cyan',
      gradient: 'from-cyan-500 to-cyan-600',
      badge: data?.deliverables.campaignDeck.slideCount
        ? `${data.deliverables.campaignDeck.slideCount} Slides`
        : 'N/A',
      isPowerPoint: data?.deliverables.campaignDeck.url ? true : false,
      downloadUrl: data?.deliverables.campaignDeck.url || null,
      slideCount: data?.deliverables.campaignDeck.slideCount || 0,
      content: 'PowerPoint presentation ready for download',
    },
  ];

  const selectedResult = results[selectedTab];

  const handleConfirmNewCampaign = () => {
    setShowConfirmModal(false);
    onRetry();
  };

  const handleDownloadAll = async () => {
    if (!data?.campaignId) return;
    try {
      await downloadAllCampaign(data.campaignId);
    } catch (error) {
      console.error('Failed to download all files:', error);
    }
  };

  const handleDownloadIndividual = async () => {
    if (!data?.campaignId) return;

    const fileTypeMap: Record<string, { type: string; filename: string }> = {
      'Brand Overview': { type: 'brand-intelligence', filename: 'brand_intelligence.md' },
      'Strategic Brief': { type: 'strategic-brief', filename: 'strategic_brief.md' },
      'Social Media': { type: 'social-media', filename: 'social_media.md' },
      'Email Sequence': { type: 'email-sequence', filename: 'email_sequence.md' },
      'Blog Article': { type: 'blog-article', filename: 'blog_article.md' },
      'Ad Copy': { type: 'ad-copy', filename: 'ad_copy.md' },
      'Hero Video': { type: 'video-script', filename: 'video_script.md' },
      'Campaign Deck': { type: 'campaign-deck', filename: 'campaign_deck.md' },
    };

    const fileInfo = fileTypeMap[selectedResult.title];
    if (!fileInfo) {
      console.error('Unknown file type:', selectedResult.title);
      return;
    }

    try {
      await downloadDeliverable(data.campaignId, fileInfo.type, fileInfo.filename);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  const handleSaveBrandEdit = async (editData: BrandEditData) => {
    if (!data?.campaignId) return;

    try {
      // Reconstruct the JSON with updated data
      let updatedJson = {};
      try {
        const originalJson = JSON.parse(selectedResult.brandData?.json || '{}');
        updatedJson = {
          ...originalJson,
          name: editData.brandName || originalJson.name,
          businessName: editData.brandName || originalJson.businessName,
        };
      } catch (e) {
        updatedJson = { name: editData.brandName };
      }

      // Reconstruct guidelines markdown
      let updatedGuidelines = '## Brand Identity\n\n';

      if (editData.primaryColors.length > 0 || editData.secondaryColors.length > 0) {
        updatedGuidelines += '### Color Palette\n\n';

        if (editData.primaryColors.length > 0 && editData.primaryColors[0].name && editData.primaryColors[0].hex) {
          updatedGuidelines += '**Primary Colors:**\n';
          editData.primaryColors.forEach(color => {
            if (color.name && color.hex) {
              updatedGuidelines += `- ${color.name}: ${color.hex}\n`;
            }
          });
          updatedGuidelines += '\n';
        }

        if (editData.secondaryColors.length > 0 && editData.secondaryColors[0].name && editData.secondaryColors[0].hex) {
          updatedGuidelines += '**Secondary Colors:**\n';
          editData.secondaryColors.forEach(color => {
            if (color.name && color.hex) {
              updatedGuidelines += `- ${color.name}: ${color.hex}\n`;
            }
          });
          updatedGuidelines += '\n';
        }
      }

      if (editData.fonts.primary || editData.fonts.secondary || editData.fonts.heading) {
        updatedGuidelines += '### Typography\n\n';
        if (editData.fonts.primary) updatedGuidelines += `- Primary Font: ${editData.fonts.primary}\n`;
        if (editData.fonts.secondary) updatedGuidelines += `- Secondary Font: ${editData.fonts.secondary}\n`;
        if (editData.fonts.heading) updatedGuidelines += `- Heading Font: ${editData.fonts.heading}\n`;
        updatedGuidelines += '\n';
      }

      updatedGuidelines += '## VOICE & MESSAGING ANALYSIS\n\n';

      if (editData.toneOfVoice.filter(t => t.trim()).length > 0) {
        updatedGuidelines += '### Tone of Voice\n';
        editData.toneOfVoice.forEach(tone => {
          if (tone.trim()) updatedGuidelines += `- ${tone}\n`;
        });
        updatedGuidelines += '\n';
      }

      updatedGuidelines += '## BRAND ESSENCE SUMMARY\n\n';

      if (editData.brandPersonality.filter(p => p.trim()).length > 0) {
        updatedGuidelines += '### Brand Personality\n';
        editData.brandPersonality.forEach(trait => {
          if (trait.trim()) updatedGuidelines += `- ${trait}\n`;
        });
      }

      // Save to database
      const { error } = await supabase
        .from('campaign_results')
        .update({
          brand_json: updatedJson,
          brand_guidelines: updatedGuidelines,
          updated_at: new Date().toISOString(),
        })
        .eq('campaign_id', data.campaignId);

      if (error) throw error;

      // Update local state
      setEditedBrandData({
        json: JSON.stringify(updatedJson),
        guidelines: updatedGuidelines,
      });

      setShowBrandEditModal(false);
    } catch (error) {
      console.error('Failed to save brand edit:', error);
      alert('Failed to save changes. Please try again.');
    }
  };

  const handleContentUpdate = async (deliverableType: string, newContent: string) => {
    if (!data?.campaignId) return;

    try {
      // Update local state
      setEditedContent(prev => ({ ...prev, [deliverableType]: newContent }));

      // Save to database
      const updateField = `${deliverableType}_content`;
      const { error } = await supabase
        .from('campaign_results')
        .update({
          [updateField]: newContent,
          updated_at: new Date().toISOString(),
        })
        .eq('campaign_id', data.campaignId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to save content update:', error);
      alert('Failed to save changes. Please try again.');
    }
  };

  const handleAIRefine = async (deliverableType: string, itemIndex: number | undefined, prompt: string) => {
    if (!data?.campaignId) return;

    try {
      const currentContent = editedContent[deliverableType] || getOriginalContent(deliverableType);

      const result = await refineDeliverable({
        campaignId: data.campaignId,
        deliverableType,
        currentContent,
        refinementPrompt: prompt,
        itemIndex,
      });

      if (result.success && result.refinedContent) {
        await handleContentUpdate(deliverableType, result.refinedContent);
      } else {
        alert(result.error || 'Failed to refine content');
      }
    } catch (error) {
      console.error('Failed to refine content:', error);
      alert('Failed to refine content. Please try again.');
    }
  };

  const getOriginalContent = (deliverableType: string): string => {
    switch (deliverableType) {
      case 'strategicBrief':
        return data?.deliverables.strategicBrief || '';
      case 'socialMedia':
        return data?.deliverables.socialMedia || '';
      case 'emailSequence':
        return data?.deliverables.emailSequence || '';
      case 'blogArticle':
        return data?.deliverables.blogArticle || '';
      case 'adCopy':
        return data?.deliverables.adCopy || '';
      case 'videoScript':
        return data?.deliverables.videoScript || '';
      default:
        return '';
    }
  };

  const getDisplayContent = (deliverableType: string): string => {
    return editedContent[deliverableType] || getOriginalContent(deliverableType);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img src="/arcusai.png" alt="Arcus AI" className="h-8" />
              <div className="h-6 w-px bg-gray-300"></div>
              <span className="text-sm font-medium text-gray-600">Campaign Dashboard</span>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-200 space-y-2">
          <button
            onClick={handleDownloadAll}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download All
          </button>
          <button
            onClick={() => setShowConfirmModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            New Campaign
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {results.map((result, index) => {
            const TabIcon = result.icon;
            const isActive = selectedTab === index;

            return (
              <button
                key={index}
                onClick={() => setSelectedTab(index)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all rounded-lg ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className={`flex-shrink-0 w-8 h-8 ${isActive ? 'bg-blue-100' : 'bg-gray-100'} rounded-lg flex items-center justify-center`}>
                  <TabIcon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
                    {result.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="font-medium">{url}</span>
            <span>•</span>
            <span className="capitalize">{industry}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          <div className="p-8">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedResult.title}</h2>
                <p className="text-sm text-gray-600">{selectedResult.description}</p>
              </div>
              <div className="flex items-center gap-3">
                {selectedResult.isBrandIntelligence && (
                  <button
                    onClick={() => setShowBrandEditModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                )}
                <button
                  onClick={handleDownloadIndividual}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>

            <div>
              {selectedResult.isBrandIntelligence && selectedResult.brandData?.json ? (
                <BrandIntelligence
                  jsonData={selectedResult.brandData.json}
                  extractedImages={selectedResult.brandData.extractedImages}
                  guidelines={selectedResult.brandData.guidelines}
                />
              ) : selectedResult.isStrategicBrief ? (
                <StrategicBriefView content={getDisplayContent('strategicBrief')} />
              ) : selectedResult.isSocialMedia ? (
                <SocialMediaView
                  content={getDisplayContent('socialMedia')}
                  onContentUpdate={(newContent) => handleContentUpdate('socialMedia', newContent)}
                  onAIRefine={(itemIndex, prompt) => handleAIRefine('socialMedia', itemIndex, prompt)}
                />
              ) : selectedResult.isEmailSequence ? (
                <EmailSequenceView
                  content={getDisplayContent('emailSequence')}
                  onContentUpdate={(newContent) => handleContentUpdate('emailSequence', newContent)}
                  onAIRefine={(itemIndex, prompt) => handleAIRefine('emailSequence', itemIndex, prompt)}
                />
              ) : selectedResult.isBlogArticle ? (
                <BlogArticleView
                  content={getDisplayContent('blogArticle')}
                  onContentUpdate={(newContent) => handleContentUpdate('blogArticle', newContent)}
                  onAIRefine={(prompt) => handleAIRefine('blogArticle', undefined, prompt)}
                />
              ) : selectedResult.isAdCopy ? (
                <AdCopyView
                  content={getDisplayContent('adCopy')}
                  onContentUpdate={(newContent) => handleContentUpdate('adCopy', newContent)}
                  onAIRefine={(itemIndex, prompt) => handleAIRefine('adCopy', itemIndex, prompt)}
                />
              ) : selectedResult.isVideoScript ? (
                <VideoScriptView
                  content={getDisplayContent('videoScript')}
                  onContentUpdate={(newContent) => handleContentUpdate('videoScript', newContent)}
                  onAIRefine={(itemIndex, prompt) => handleAIRefine('videoScript', itemIndex, prompt)}
                />
              ) : selectedResult.isVideo && selectedResult.videoUrl ? (
                <VideoPlayer
                  videoUrl={selectedResult.videoUrl}
                  thumbnail={selectedResult.thumbnail}
                  title={selectedResult.title}
                />
              ) : selectedResult.isPowerPoint && selectedResult.downloadUrl ? (
                <PowerPointDownload
                  downloadUrl={selectedResult.downloadUrl}
                  slideCount={selectedResult.slideCount}
                  title={selectedResult.title}
                />
              ) : selectedResult.isImageGallery ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {selectedResult.images?.map((image, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                        <img
                          src={image.url}
                          alt={image.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <h4 className="text-lg font-semibold text-gray-900">{image.title}</h4>
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                            {image.format}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 text-xs mb-1">Dimensions</p>
                            <p className="font-medium text-gray-900">{image.dimensions}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs mb-1">Use Case</p>
                            <p className="font-medium text-gray-900">{image.useCase}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl p-8">
                  <p className="text-base text-gray-700">{selectedResult.content}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Start New Campaign?</h3>
              <p className="text-sm text-gray-600">
                Creating a new campaign will clear your current results. Make sure you've downloaded any content you want to keep.
              </p>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-900">
                This action cannot be undone. All current deliverables will be lost.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmNewCampaign}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Start New
              </button>
            </div>
          </div>
        </div>
      )}

      <BrandEditModal
        isOpen={showBrandEditModal}
        onClose={() => setShowBrandEditModal(false)}
        onSave={handleSaveBrandEdit}
        initialData={{
          json: selectedResult.brandData?.json || '{}',
          guidelines: selectedResult.brandData?.guidelines || '',
          extractedImages: selectedResult.brandData?.extractedImages || [],
        }}
      />
      </div>
    </div>
  );
}
