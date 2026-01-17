const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface CampaignRequest {
  website: string;
  industry: string;
  brief: string;
}

export interface CampaignResult {
  success: boolean;
  campaignId: string;
  outputFolder: string;
  deliverables: {
    brandContext: {
      json: string | null;
      extractedImages: string[];
      colorsAndFonts: string | null;
    };
    strategicBrief: string | null;
    socialMedia: string | null;
    emailSequence: string | null;
    blogArticle: string | null;
    adCopy: string | null;
    videoScript: string | null;
    campaignDeck: {
      url: string | null;
      slideCount: number;
    };
    video: {
      url: string | null;
      duration: number | null;
      thumbnail: string | null;
    };
    images: {
      hero: string | null;
      socialPost: string | null;
      socialStory: string | null;
      emailBanner: string | null;
      adCreative: string | null;
      blogFeatured: string | null;
    };
  };
  error?: string;
}

export const generateCampaign = async (
  website: string,
  industry: string,
  brief: string
): Promise<CampaignResult> => {
  await new Promise(resolve => setTimeout(resolve, 3000));

  const campaignId = `campaign-${Date.now()}`;

  return {
    success: true,
    campaignId,
    outputFolder: `/campaigns/${campaignId}`,
    deliverables: {
      brandContext: {
        json: `{
  "websiteUrl": "${website}",
  "industry": "${industry}",
  "colors": {
    "primary": "#1B365D",
    "secondary": "#FF6B00",
    "white": "#FFFFFF",
    "lightGray": "#F5F5F5",
    "darkGray": "#333333",
    "mediumGray": "#666666"
  },
  "typography": {
    "primaryFont": "Helvetica Neue, Arial, sans-serif",
    "headers": "Bold weight, clean lines",
    "bodyText": "Regular weight, high readability"
  },
  "voiceTone": ["Professional", "Authoritative", "Approachable", "Informative", "Aspirational", "Trust-building"],
  "targetAudience": "Business professionals aged 25-55 in ${industry} sector",
  "brandArchetype": "The Sage: Knowledge, wisdom, and professional expertise",
  "emotionalTriggers": ["Career advancement", "Professional growth", "Network building"]
}`,
        extractedImages: [
          'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg',
          'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg',
          'https://images.pexels.com/photos/3184338/pexels-photo-3184338.jpeg',
        ],
        colorsAndFonts: `# BRAND INTELLIGENCE REPORT

**Website Analyzed:** ${website}
**Industry:** ${industry}
**Generated:** ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

---

## 2. BRAND IDENTITY EXTRACTION

### Color Palette
Primary Colors:
- Navy Blue: #1B365D
- White: #FFFFFF
- Light Gray: #F5F5F5

Secondary Colors:
- Orange Accent: #FF6B00
- Dark Gray: #333333
- Medium Gray: #666666

### Typography
- Primary Font: Helvetica Neue or Arial (Sans-serif)
- Headers: Bold weight, clean lines
- Body Text: Regular weight, high readability
- Font Sizes:
  - Headers: 24-32px
  - Subheaders: 18-22px
  - Body: 14-16px

### Visual Patterns & Design Elements
- Minimal use of shadows
- Sharp corners on containers
- Clear hierarchy in typography
- Consistent padding and margins
- Clean dividing lines between sections
- Simple, effective navigation structure

---

## 3. VISUAL ASSET ANALYSIS

### Image Style Guidelines
- Professional photography style
- Business casual to formal attire in images
- Diverse representation of professionals
- Clean, uncluttered backgrounds
- Natural lighting with slight warmth
- Focus on people and collaboration

### Visual Patterns
- Professional headshots
- Team collaboration scenes
- Office environments
- Technology and devices in use
- Graphs and data visualizations
- Networking and handshake imagery

---

## 4. VOICE & MESSAGING ANALYSIS

### Tone of Voice
- Professional
- Authoritative
- Approachable
- Informative
- Aspirational
- Trust-building

### Key Phrases & Language Patterns
- "Connect with professionals"
- "Build your network"
- "Career opportunities"
- "Professional development"
- "Industry insights"
- "Join the conversation"
- "Share your expertise"

### Emotional Triggers
- Career advancement
- Professional growth
- Network building
- Knowledge sharing
- Industry recognition
- Business success

---

## 5. TARGET AUDIENCE ANALYSIS

### Primary Persona Demographics
- Age: 25-55 years old
- Education: College graduates and above
- Occupation: Professionals, managers, executives
- Income: Middle to upper-middle class
- Location: Urban and suburban areas globally

### Psychographics
- Career-focused individuals
- Network-conscious professionals
- Continuous learners
- Industry thought leaders
- Business decision-makers
- Job seekers and recruiters

### Motivations
- Career advancement
- Professional networking
- Knowledge acquisition
- Personal branding
- Business development
- Recruitment and hiring

---

## 6. COMPETITIVE & MARKET CONTEXT

### Industry Positioning
- Leading professional networking platform
- Business-focused social media
- Career development hub
- B2B marketing channel
- Recruitment and talent acquisition platform

### Competitive Advantages
- Largest professional network globally
- Credibility and trust in business community
- Rich professional data and insights
- Premium subscription model
- Integration with business workflows

---

## 7. BRAND ESSENCE SUMMARY

### Brand Archetype
- The Sage: Knowledge, wisdom, and professional expertise
- The Ruler: Authority, leadership, and success

### Brand Promise
"Connecting the world's professionals to make them more productive and successful"

### Brand Personality
- Professional
- Trustworthy
- Empowering
- Intelligent
- Inclusive
- Results-oriented

---

## 8. STRATEGIC RECOMMENDATIONS

### Content Strategy
- Share industry insights and thought leadership
- Highlight success stories and case studies
- Provide actionable career advice
- Showcase professional development resources
- Feature diverse professional perspectives

### Visual Strategy
- Maintain clean, professional aesthetic
- Use authentic professional imagery
- Incorporate data visualizations
- Ensure diverse representation
- Keep design minimal and purposeful

### Messaging Strategy
- Emphasize career growth and opportunity
- Build trust through authenticity
- Encourage professional engagement
- Highlight platform value propositions
- Use aspirational yet attainable language

---

## 9. BRAND GUIDELINES FOR CAMPAIGN

### DO's
- Use professional, business-appropriate language
- Feature diverse professionals and industries
- Maintain clean, uncluttered designs
- Include clear calls-to-action
- Align with career advancement themes
- Use data and insights to support claims
- Show real-world business applications

### DON'Ts
- Avoid casual or overly playful tone
- Don't use low-quality or stock imagery that feels staged
- Avoid cluttered layouts or busy designs
- Don't make unrealistic promises
- Avoid excluding any professional demographic
- Don't stray from the core brand colors
- Avoid content that doesn't serve professional development

---

**Document Status:** ✅ Complete
**Analysis Depth:** Comprehensive
**Ready for:** Campaign Development`,
      },
      strategicBrief: `# Strategic Marketing Brief for ${industry}\n\n## Campaign Overview\nWebsite: ${website}\nIndustry: ${industry}\n\n## Target Audience\nPrimary demographic: Business professionals aged 25-45\nSecondary demographic: Marketing teams and decision-makers\n\n## Campaign Objectives\n1. Increase brand awareness by 40%\n2. Generate qualified leads\n3. Drive website traffic by 60%\n4. Establish thought leadership\n\n## Key Messages\n- Innovation-driven solutions\n- Proven ROI and results\n- Industry expertise\n\n## Campaign Timeline\n- Launch: Q1 2024\n- Duration: 12 weeks\n- Review points: Weekly\n\n## Budget Allocation\n- Social Media: 30%\n- Content Marketing: 25%\n- Paid Advertising: 25%\n- Email Marketing: 20%`,

      socialMedia: `# Social Media Content Calendar\n\n## Week 1-2: Awareness Phase\n\n### LinkedIn Post 1\n🚀 Innovation meets execution in the ${industry} space.\n\nDiscover how leading companies are transforming their approach to [key benefit].\n\nLearn more: ${website}\n\n#Innovation #${industry} #DigitalTransformation\n\n### Twitter Thread\n1/ The ${industry} landscape is evolving. Here's what you need to know 🧵\n\n2/ Traditional approaches are no longer enough. Modern solutions require:\n✅ Data-driven insights\n✅ Scalable technology\n✅ Customer-first thinking\n\n3/ That's where we come in. ${website}\n\n### Instagram Post\n[Image: Modern office workspace]\n\nCaption: Behind every great campaign is a team dedicated to excellence. Meet the future of ${industry}.\n\n## Week 3-4: Engagement Phase\n\n### LinkedIn Post 2\nCase Study Alert 📊\n\nHow we helped [Company] achieve 150% ROI in just 90 days.\n\nKey results:\n• 60% increase in qualified leads\n• 40% reduction in customer acquisition cost\n• 3x improvement in conversion rates\n\nRead the full story: [link]\n\n### Facebook Post\nExcited to announce our latest innovation in ${industry}! 🎉\n\nJoin thousands of satisfied customers who trust us with their [key benefit].\n\nDiscover the difference: ${website}`,

      emailSequence: `# Email Marketing Sequence\n\n## Email 1: Welcome (Day 0)\nSubject: Welcome to [Company Name] - Your Journey Starts Here\n\nHi [First Name],\n\nThank you for your interest in transforming your ${industry} operations!\n\nWe're excited to have you here. Over the next few days, we'll share insights, strategies, and success stories that will help you achieve your goals.\n\nWhat to expect:\n• Day 3: Industry insights and trends\n• Day 7: Exclusive case study\n• Day 10: Special offer just for you\n\nIn the meantime, explore our resources: ${website}\n\nBest regards,\nThe Team\n\n---\n\n## Email 2: Value Education (Day 3)\nSubject: 5 Trends Reshaping ${industry} in 2024\n\nHi [First Name],\n\nThe ${industry} landscape is changing fast. Here are the top 5 trends you can't ignore:\n\n1. AI-Powered Automation\n2. Personalization at Scale\n3. Data Privacy & Compliance\n4. Omnichannel Integration\n5. Sustainable Practices\n\nWant to learn how industry leaders are staying ahead?\n\nRead our full report: [link]\n\n---\n\n## Email 3: Case Study (Day 7)\nSubject: How [Company] Achieved 10x ROI\n\nHi [First Name],\n\nResults speak louder than words.\n\nDiscover how [Company] used our solution to:\n✅ Increase revenue by 300%\n✅ Reduce costs by 45%\n✅ Scale operations efficiently\n\nRead the full case study: [link]\n\nReady to achieve similar results? Let's talk.\n\n[Book a Call CTA]\n\n---\n\n## Email 4: Limited Offer (Day 10)\nSubject: [First Name], exclusive offer inside\n\nHi [First Name],\n\nAs a valued subscriber, we're offering you exclusive early access to our premium features.\n\nFor a limited time, get:\n• 30% off your first 3 months\n• Free onboarding & training\n• Dedicated account manager\n\nClaim your offer: [link]\n\nOffer expires in 48 hours!\n\nDon't miss out,\nThe Team`,

      blogArticle: `# The Future of ${industry}: A Complete Guide for 2024\n\n## Introduction\n\nThe ${industry} sector is undergoing unprecedented transformation. As we navigate through 2024, businesses face new challenges and opportunities that require innovative solutions and strategic thinking.\n\nIn this comprehensive guide, we'll explore the key trends, strategies, and best practices that are shaping the future of ${industry}.\n\n## The Current Landscape\n\nThe ${industry} market has evolved significantly over the past few years. Here's what's driving change:\n\n### Digital Transformation\nCompanies are increasingly adopting digital-first strategies to stay competitive. This shift has created new opportunities for businesses willing to embrace innovation.\n\n### Customer Expectations\nModern customers demand:\n- Personalized experiences\n- Instant gratification\n- Seamless omnichannel interactions\n- Transparent communication\n\n### Technological Advancement\nEmerging technologies like AI, machine learning, and automation are revolutionizing how businesses operate in the ${industry} space.\n\n## Key Strategies for Success\n\n### 1. Embrace Data-Driven Decision Making\nSuccessful companies leverage data analytics to:\n- Understand customer behavior\n- Optimize marketing campaigns\n- Predict market trends\n- Measure ROI effectively\n\n### 2. Invest in Customer Experience\nCustomer experience is the new competitive battleground. Focus on:\n- Streamlined user journeys\n- Responsive customer support\n- Continuous feedback loops\n- Proactive problem-solving\n\n### 3. Build Scalable Systems\nAs your business grows, your infrastructure must scale accordingly. Consider:\n- Cloud-based solutions\n- Automated workflows\n- Flexible architecture\n- Integration capabilities\n\n## Real-World Success Stories\n\nCompanies that have successfully navigated these challenges share common characteristics:\n- Clear vision and strategy\n- Willingness to innovate\n- Customer-centric approach\n- Strong leadership\n\n## Looking Ahead\n\nThe future of ${industry} is bright for those prepared to adapt and innovate. By staying informed, investing in the right technologies, and maintaining a customer-first mindset, businesses can thrive in this evolving landscape.\n\n## Conclusion\n\nSuccess in ${industry} requires a combination of strategic thinking, technological adoption, and unwavering focus on customer value. The companies that will lead tomorrow are those taking action today.\n\nReady to transform your ${industry} operations? Learn more at ${website}\n\n---\n\n*About the Author: This article was generated by Arcus AI, your autonomous marketing team.*`,

      adCopy: `# Paid Advertising Copy\n\n## Google Search Ads\n\n### Ad 1\nHeadline 1: Transform Your ${industry} Strategy\nHeadline 2: AI-Powered Solutions | Proven Results\nHeadline 3: Get Started Today - Free Consultation\n\nDescription 1: Join 10,000+ companies using cutting-edge technology to scale their ${industry} operations. See results in 30 days or your money back.\n\nDescription 2: Industry-leading platform with 24/7 support. Trusted by Fortune 500 companies. Book your free demo today!\n\nFinal URL: ${website}\n\n### Ad 2\nHeadline 1: #1 ${industry} Platform - Rated 4.9/5\nHeadline 2: Save 40% on Time & Costs\nHeadline 3: Try Free for 14 Days - No Credit Card\n\nDescription 1: Streamline your operations with our award-winning platform. Used by industry leaders worldwide.\n\nDescription 2: Easy setup in minutes. Expert support included. Scale your business with confidence.\n\n## Facebook/Instagram Ads\n\n### Ad 1 (Image)\nPrimary Text: Ready to revolutionize your ${industry} approach? 🚀\n\nDiscover why leading companies choose [Company Name] for their mission-critical operations.\n\n✅ Proven ROI\n✅ Easy Integration\n✅ World-Class Support\n\nStart your free trial today!\n\nHeadline: Transform Your ${industry} Strategy\nDescription: Get started in minutes. No credit card required.\n\n### Ad 2 (Video)\nPrimary Text: What if you could cut costs by 40% while improving results?\n\nThat's exactly what our customers achieve. See how we're changing ${industry} for the better.\n\n👉 Watch the full story\n\nHeadline: Real Results. Real Companies.\nDescription: Join 10,000+ satisfied customers\n\n## LinkedIn Sponsored Content\n\n### Ad 1\nText: Is your ${industry} strategy ready for 2024?\n\nThe landscape is changing faster than ever. Companies that adapt will thrive. Those that don't will fall behind.\n\nDiscover the tools and strategies industry leaders use to stay ahead:\n\n• AI-powered automation\n• Real-time analytics\n• Seamless integration\n• Expert guidance\n\nSee why Fortune 500 companies trust us with their most important initiatives.\n\n[Learn More]\n\n### Ad 2\nText: Attention ${industry} Professionals:\n\nYour competitors are already using AI to gain an unfair advantage.\n\nDon't get left behind.\n\nOur platform helps you:\n→ Make better decisions faster\n→ Reduce operational costs\n→ Scale without limits\n→ Stay ahead of trends\n\nBook a free strategy session today.\n\n[Get Started]\n\n## Display Ad Headlines\n\n1. "The Future of ${industry} is Here"\n2. "10,000+ Companies Trust Us"\n3. "Get Results in 30 Days"\n4. "Try Free - No Credit Card"\n5. "Rated #1 by Industry Leaders"`,

      videoScript: `# Video Marketing Script\n\n## 30-Second Brand Overview\n\n**[SCENE 1: Opening - 0:00-0:05]**\nVisuals: Dynamic montage of successful businesses\nVoiceover: "In today's fast-paced ${industry} world, standing still means falling behind."\n\n**[SCENE 2: Problem - 0:05-0:15]**\nVisuals: Split screen showing traditional vs modern approaches\nVoiceover: "Traditional methods are holding you back. You need solutions that scale, adapt, and deliver results."\n\n**[SCENE 3: Solution - 0:15-0:25]**\nVisuals: Product interface and happy customers\nVoiceover: "Introducing [Company Name] - the AI-powered platform trusted by industry leaders to transform their operations."\n\n**[SCENE 4: Call to Action - 0:25-0:30]**\nVisuals: Logo and website URL\nVoiceover: "Join 10,000+ companies achieving extraordinary results. Visit ${website} today."\n\nText Overlay: "${website} | Start Free Trial"\n\n---\n\n## 60-Second Product Demo\n\n**[SCENE 1: Hook - 0:00-0:08]**\nVisuals: Engaging opening animation\nVoiceover: "What if you could automate 80% of your ${industry} operations while improving quality? Let me show you how."\n\n**[SCENE 2: Pain Points - 0:08-0:18]**\nVisuals: Common problems with X marks\nVoiceover: "We know you're dealing with rising costs, increasing complexity, and limited resources. You're not alone."\n\n**[SCENE 3: Solution Overview - 0:18-0:35]**\nVisuals: Platform walkthrough\nVoiceover: "Our platform combines AI automation with human expertise to deliver:\n- Faster results\n- Lower costs\n- Better outcomes\n- Complete peace of mind"\n\n**[SCENE 4: Social Proof - 0:35-0:45]**\nVisuals: Customer testimonials and stats\nVoiceover: "Don't just take our word for it. Over 10,000 companies trust us to power their success."\nText Overlay: "150% Average ROI | 4.9/5 Customer Rating"\n\n**[SCENE 5: Call to Action - 0:45-0:60]**\nVisuals: Clear CTA with contact information\nVoiceover: "Ready to transform your ${industry} operations? Start your free trial today. No credit card required. Visit ${website} or call us now."\n\nText Overlay: "${website} | 1-800-XXX-XXXX | Start Free Trial"\n\n---\n\n## 2-Minute Customer Success Story\n\n**[SCENE 1: Introduction - 0:00-0:20]**\nVisuals: Customer facility/office\nVoiceover: "Meet [Customer Name], a leading company in the ${industry} space. Just 6 months ago, they were struggling with [specific challenges]."\n\n[Customer Interview]\nCustomer: "We were spending too much time on manual processes. We knew there had to be a better way."\n\n**[SCENE 2: The Challenge - 0:20-0:45]**\nVisuals: B-roll of old processes\nVoiceover: "Like many companies in ${industry}, they faced:\n- Rising operational costs\n- Slow time-to-market\n- Difficulty scaling\n- Limited visibility into performance"\n\n[Customer Interview]\nCustomer: "We needed a solution that could grow with us and deliver measurable results."\n\n**[SCENE 3: The Solution - 0:45-1:20]**\nVisuals: Implementation process and platform usage\nVoiceover: "After implementing [Company Name], everything changed. Within just 30 days, they saw dramatic improvements."\n\n[Customer Interview]\nCustomer: "The onboarding was seamless. Within a week, we were seeing results. Within a month, we knew we'd made the right choice."\n\n**[SCENE 4: Results - 1:20-1:45]**\nVisuals: Impressive metrics and graphs\nVoiceover: "The numbers speak for themselves:\n- 60% reduction in operational costs\n- 3x faster time-to-market\n- 95% customer satisfaction\n- 200% ROI in first quarter"\n\n[Customer Interview]\nCustomer: "It's been transformative. We're not just keeping up anymore - we're leading our industry."\n\n**[SCENE 5: Call to Action - 1:45-2:00]**\nVisuals: Company logo and contact information\nVoiceover: "Ready to achieve similar results? Join thousands of companies transforming their ${industry} operations with [Company Name]."\n\n[Customer Interview]\nCustomer: "If you're serious about growth, this is a no-brainer."\n\nVoiceover: "Visit ${website} to start your free trial today."\n\nText Overlay: "${website} | Book Free Demo | No Credit Card Required"\n\n---\n\n**Production Notes:**\n- Use clean, modern visuals\n- Keep animations smooth and professional\n- Include captions for accessibility\n- Use upbeat, inspiring background music\n- Ensure brand colors and fonts are consistent throughout`,

      campaignDeck: {
        url: null,
        slideCount: 0,
      },
      video: {
        url: null,
        duration: null,
        thumbnail: null,
      },
      images: {
        hero: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg',
        socialPost: 'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg',
        socialStory: 'https://images.pexels.com/photos/3184338/pexels-photo-3184338.jpeg',
        emailBanner: 'https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg',
        adCreative: 'https://images.pexels.com/photos/3184287/pexels-photo-3184287.jpeg',
        blogFeatured: 'https://images.pexels.com/photos/3183197/pexels-photo-3183197.jpeg',
      },
    }
  };
};

export const downloadAllCampaign = async (campaignId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/campaigns/${campaignId}/download-all`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to download campaign files');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${campaignId}.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Error downloading all campaign files:', error);
    throw error;
  }
};

export const downloadDeliverable = async (
  campaignId: string,
  fileType: string,
  filename: string
) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/campaigns/${campaignId}/download/${fileType}`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to download ${fileType}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error(`Error downloading ${fileType}:`, error);
    throw error;
  }
};
