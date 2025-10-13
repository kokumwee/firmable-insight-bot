import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ProfileData {
  name: string;
  industry: string;
  description: string;
  target_audience: string;
  value_proposition: string;
  tone: string;
  keywords: string[];
  updated_at: string | null;
}

const TONE_OPTIONS = ['Professional', 'Friendly', 'Bold', 'Technical', 'Conversational'];

export function MyCompanyProfile() {
  const [isOpen, setIsOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<ProfileData>({
    name: '',
    industry: '',
    description: '',
    target_audience: '',
    value_proposition: '',
    tone: 'Professional',
    keywords: [],
    updated_at: null
  });
  const [savedData, setSavedData] = useState<ProfileData | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('mycompany', {
        body: { action: 'get' }
      });

      if (error) {
        console.error('Error loading profile:', error);
        return;
      }

      if (data?.ok && data.data) {
        setFormData(data.data);
        setSavedData(data.data);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('mycompany', {
        body: {
          action: 'update',
          payload: formData
        }
      });

      if (error) {
        throw error;
      }

      if (!data.ok) {
        throw new Error(data.message || 'Failed to save profile');
      }

      setSavedData(data.data);
      toast({
        title: "Profile saved",
        description: "Outreach will use this info.",
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save profile",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (savedData) {
      setFormData(savedData);
      setKeywordInput('');
      toast({
        title: "Reset",
        description: "Reverted to last saved state",
      });
    }
  };

  const addKeyword = () => {
    const keyword = keywordInput.trim().toLowerCase();
    if (keyword && !formData.keywords.includes(keyword) && formData.keywords.length < 10) {
      setFormData(prev => ({
        ...prev,
        keywords: [...prev.keywords, keyword]
      }));
      setKeywordInput('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== keyword)
    }));
  };

  const getLastUpdated = () => {
    if (!formData.updated_at) return null;
    const date = new Date(formData.updated_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1d ago';
    return `${diffDays}d ago`;
  };

  return (
    <div className="border border-border rounded-lg bg-card">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
            <div className="flex flex-col items-start">
              <h3 className="font-semibold text-foreground">My Company</h3>
              {getLastUpdated() && (
                <span className="text-xs text-muted-foreground">
                  Last updated {getLastUpdated()}
                </span>
              )}
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Your company name"
                maxLength={80}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={formData.industry}
                onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                placeholder="e.g., SaaS, Healthcare, Finance"
                maxLength={80}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">What we do (1–2 lines)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of your company"
                maxLength={240}
                className="min-h-[60px] resize-none"
              />
              <span className="text-xs text-muted-foreground">
                {formData.description.length}/240
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target-audience">Primary audience</Label>
              <Input
                id="target-audience"
                value={formData.target_audience}
                onChange={(e) => setFormData(prev => ({ ...prev, target_audience: e.target.value }))}
                placeholder="e.g., B2B SaaS companies, SMBs"
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="value-prop">Value proposition</Label>
              <Textarea
                id="value-prop"
                value={formData.value_proposition}
                onChange={(e) => setFormData(prev => ({ ...prev, value_proposition: e.target.value }))}
                placeholder="What makes you unique?"
                maxLength={240}
                className="min-h-[60px] resize-none"
              />
              <span className="text-xs text-muted-foreground">
                {formData.value_proposition.length}/240
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">Preferred tone</Label>
              <Select
                value={formData.tone}
                onValueChange={(value) => setFormData(prev => ({ ...prev, tone: value }))}
              >
                <SelectTrigger id="tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map(tone => (
                    <SelectItem key={tone} value={tone}>{tone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords to include</Label>
              <div className="flex gap-2">
                <Input
                  id="keywords"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                  placeholder="Type and press Enter"
                  disabled={formData.keywords.length >= 10}
                />
                <Button
                  type="button"
                  onClick={addKeyword}
                  disabled={!keywordInput.trim() || formData.keywords.length >= 10}
                  variant="outline"
                  size="sm"
                >
                  Add
                </Button>
              </div>
              {formData.keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.keywords.map(keyword => (
                    <span
                      key={keyword}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground"
                    >
                      {keyword}
                      <button
                        onClick={() => removeKeyword(keyword)}
                        className="hover:text-destructive"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <span className="text-xs text-muted-foreground">
                {formData.keywords.length}/10 keywords
              </span>
            </div>

            <p className="text-xs text-muted-foreground italic">
              This profile is added to every outreach message.
            </p>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Profile'}
              </Button>
              <Button
                onClick={handleReset}
                variant="outline"
                disabled={!savedData || isSaving}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}