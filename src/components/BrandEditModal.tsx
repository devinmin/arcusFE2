import { X, Save } from 'lucide-react';
import { useState, useEffect } from 'react';

interface BrandEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: BrandEditData) => void;
  initialData: {
    json: string;
    guidelines: string | null;
    extractedImages: string[];
  };
}

export interface BrandEditData {
  brandName: string;
  primaryColors: Array<{ name: string; hex: string }>;
  secondaryColors: Array<{ name: string; hex: string }>;
  fonts: {
    primary: string;
    secondary: string;
    heading: string;
  };
  toneOfVoice: string[];
  brandPersonality: string[];
}

export function BrandEditModal({ isOpen, onClose, onSave, initialData }: BrandEditModalProps) {
  const [formData, setFormData] = useState<BrandEditData>({
    brandName: '',
    primaryColors: [{ name: '', hex: '' }],
    secondaryColors: [{ name: '', hex: '' }],
    fonts: {
      primary: '',
      secondary: '',
      heading: '',
    },
    toneOfVoice: [''],
    brandPersonality: [''],
  });

  useEffect(() => {
    if (initialData.json && initialData.guidelines) {
      // Parse existing data to populate form
      try {
        const jsonData = JSON.parse(initialData.json);
        const brandName = jsonData.name || jsonData.businessName || '';

        // Extract colors from guidelines
        const primaryColors = extractColorsFromGuidelines(initialData.guidelines, 'Primary');
        const secondaryColors = extractColorsFromGuidelines(initialData.guidelines, 'Secondary');

        // Extract fonts
        const fonts = extractFontsFromGuidelines(initialData.guidelines);

        // Extract tone and personality
        const toneOfVoice = extractArrayFromGuidelines(initialData.guidelines, 'Tone of Voice');
        const brandPersonality = extractArrayFromGuidelines(initialData.guidelines, 'Brand Personality');

        setFormData({
          brandName,
          primaryColors: primaryColors.length > 0 ? primaryColors : [{ name: '', hex: '' }],
          secondaryColors: secondaryColors.length > 0 ? secondaryColors : [{ name: '', hex: '' }],
          fonts,
          toneOfVoice: toneOfVoice.length > 0 ? toneOfVoice : [''],
          brandPersonality: brandPersonality.length > 0 ? brandPersonality : [''],
        });
      } catch (e) {
        console.error('Error parsing initial data:', e);
      }
    }
  }, [initialData]);

  const extractColorsFromGuidelines = (guidelines: string, type: 'Primary' | 'Secondary'): Array<{ name: string; hex: string }> => {
    const colors: Array<{ name: string; hex: string }> = [];
    const lines = guidelines.split('\n');
    let inColorSection = false;
    let inTargetType = false;

    lines.forEach(line => {
      if (line.includes('### Color Palette')) {
        inColorSection = true;
      } else if (line.startsWith('###') && inColorSection && !line.includes('Color Palette')) {
        inColorSection = false;
      } else if (inColorSection) {
        if (line.includes(`${type} Colors:`)) {
          inTargetType = true;
        } else if (line.includes('Colors:') && !line.includes(`${type} Colors:`)) {
          inTargetType = false;
        } else if (inTargetType && line.startsWith('- ') && line.includes('#')) {
          const match = line.match(/- ([^:]+):\s*(#[A-Fa-f0-9]{6}|#[A-Fa-f0-9]{3})/);
          if (match) {
            colors.push({
              name: match[1].trim(),
              hex: match[2].toUpperCase(),
            });
          }
        }
      }
    });

    return colors;
  };

  const extractFontsFromGuidelines = (guidelines: string): { primary: string; secondary: string; heading: string } => {
    const fonts = { primary: '', secondary: '', heading: '' };
    const lines = guidelines.split('\n');
    let inTypographySection = false;

    lines.forEach(line => {
      if (line.includes('### Typography')) {
        inTypographySection = true;
      } else if (line.startsWith('###') && inTypographySection) {
        inTypographySection = false;
      } else if (inTypographySection && (line.startsWith('- ') || line.startsWith('  - '))) {
        const cleanLine = line.replace(/^[\s-]+/, '');
        if (cleanLine.toLowerCase().includes('primary') || cleanLine.toLowerCase().includes('heading')) {
          const match = cleanLine.match(/:\s*(.+)/);
          if (match) {
            if (cleanLine.toLowerCase().includes('heading')) {
              fonts.heading = match[1].trim();
            } else {
              fonts.primary = match[1].trim();
            }
          }
        } else if (cleanLine.toLowerCase().includes('secondary') || cleanLine.toLowerCase().includes('body')) {
          const match = cleanLine.match(/:\s*(.+)/);
          if (match) fonts.secondary = match[1].trim();
        }
      }
    });

    return fonts;
  };

  const extractArrayFromGuidelines = (guidelines: string, sectionName: string): string[] => {
    const items: string[] = [];
    const lines = guidelines.split('\n');
    let inSection = false;

    lines.forEach(line => {
      if (line.includes(`### ${sectionName}`) || line.includes(`**${sectionName}**`)) {
        inSection = true;
      } else if ((line.startsWith('###') || line.startsWith('**')) && inSection) {
        inSection = false;
      } else if (inSection && line.startsWith('- ')) {
        items.push(line.replace('- ', '').trim());
      }
    });

    return items;
  };

  const handleColorChange = (type: 'primary' | 'secondary', index: number, field: 'name' | 'hex', value: string) => {
    const colors = type === 'primary' ? [...formData.primaryColors] : [...formData.secondaryColors];
    colors[index][field] = value;
    setFormData({ ...formData, [type === 'primary' ? 'primaryColors' : 'secondaryColors']: colors });
  };

  const addColor = (type: 'primary' | 'secondary') => {
    const colors = type === 'primary' ? [...formData.primaryColors] : [...formData.secondaryColors];
    colors.push({ name: '', hex: '' });
    setFormData({ ...formData, [type === 'primary' ? 'primaryColors' : 'secondaryColors']: colors });
  };

  const removeColor = (type: 'primary' | 'secondary', index: number) => {
    const colors = type === 'primary' ? [...formData.primaryColors] : [...formData.secondaryColors];
    if (colors.length > 1) {
      colors.splice(index, 1);
      setFormData({ ...formData, [type === 'primary' ? 'primaryColors' : 'secondaryColors']: colors });
    }
  };

  const handleArrayChange = (field: 'toneOfVoice' | 'brandPersonality', index: number, value: string) => {
    const arr = [...formData[field]];
    arr[index] = value;
    setFormData({ ...formData, [field]: arr });
  };

  const addArrayItem = (field: 'toneOfVoice' | 'brandPersonality') => {
    setFormData({ ...formData, [field]: [...formData[field], ''] });
  };

  const removeArrayItem = (field: 'toneOfVoice' | 'brandPersonality', index: number) => {
    const arr = [...formData[field]];
    if (arr.length > 1) {
      arr.splice(index, 1);
      setFormData({ ...formData, [field]: arr });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

        <div className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-2xl font-bold text-gray-900">Edit Brand Information</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            {/* Brand Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Brand Name</label>
              <input
                type="text"
                value={formData.brandName}
                onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter brand name"
              />
            </div>

            {/* Primary Colors */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">Primary Colors</label>
              {formData.primaryColors.map((color, index) => (
                <div key={index} className="flex gap-3 mb-3">
                  <input
                    type="text"
                    value={color.name}
                    onChange={(e) => handleColorChange('primary', index, 'name', e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Color name"
                  />
                  <input
                    type="text"
                    value={color.hex}
                    onChange={(e) => handleColorChange('primary', index, 'hex', e.target.value)}
                    className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    placeholder="#000000"
                  />
                  <div
                    className="w-12 h-10 rounded-lg border border-gray-300"
                    style={{ backgroundColor: color.hex || '#fff' }}
                  />
                  {formData.primaryColors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeColor('primary', index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addColor('primary')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add Primary Color
              </button>
            </div>

            {/* Secondary Colors */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">Secondary Colors</label>
              {formData.secondaryColors.map((color, index) => (
                <div key={index} className="flex gap-3 mb-3">
                  <input
                    type="text"
                    value={color.name}
                    onChange={(e) => handleColorChange('secondary', index, 'name', e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Color name"
                  />
                  <input
                    type="text"
                    value={color.hex}
                    onChange={(e) => handleColorChange('secondary', index, 'hex', e.target.value)}
                    className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    placeholder="#000000"
                  />
                  <div
                    className="w-12 h-10 rounded-lg border border-gray-300"
                    style={{ backgroundColor: color.hex || '#fff' }}
                  />
                  {formData.secondaryColors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeColor('secondary', index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addColor('secondary')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add Secondary Color
              </button>
            </div>

            {/* Fonts */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">Typography</label>
              <div className="space-y-3">
                <input
                  type="text"
                  value={formData.fonts.primary}
                  onChange={(e) => setFormData({ ...formData, fonts: { ...formData.fonts, primary: e.target.value } })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Primary Font (e.g., Inter, Arial)"
                />
                <input
                  type="text"
                  value={formData.fonts.secondary}
                  onChange={(e) => setFormData({ ...formData, fonts: { ...formData.fonts, secondary: e.target.value } })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Secondary Font (e.g., Roboto, Georgia)"
                />
                <input
                  type="text"
                  value={formData.fonts.heading}
                  onChange={(e) => setFormData({ ...formData, fonts: { ...formData.fonts, heading: e.target.value } })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Heading Font (e.g., Montserrat, Helvetica)"
                />
              </div>
            </div>

            {/* Tone of Voice */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">Tone of Voice</label>
              {formData.toneOfVoice.map((tone, index) => (
                <div key={index} className="flex gap-3 mb-3">
                  <input
                    type="text"
                    value={tone}
                    onChange={(e) => handleArrayChange('toneOfVoice', index, e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Professional, Friendly, Approachable"
                  />
                  {formData.toneOfVoice.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeArrayItem('toneOfVoice', index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addArrayItem('toneOfVoice')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add Tone Attribute
              </button>
            </div>

            {/* Brand Personality */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">Brand Personality</label>
              {formData.brandPersonality.map((trait, index) => (
                <div key={index} className="flex gap-3 mb-3">
                  <input
                    type="text"
                    value={trait}
                    onChange={(e) => handleArrayChange('brandPersonality', index, e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Innovative, Trustworthy, Energetic"
                  />
                  {formData.brandPersonality.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeArrayItem('brandPersonality', index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addArrayItem('brandPersonality')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add Personality Trait
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
