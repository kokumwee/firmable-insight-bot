import { ExternalLink, RefreshCw, MapPin, Users, Building2, Target, Mail, Phone, Linkedin, Twitter, Facebook, Instagram, Info, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConfidenceBadge, ConfidenceLevel } from "./ConfidenceBadge";
import { EvidencePopover } from "./EvidencePopover";
import { FitBadge } from "./FitBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { UnverifiedSuggestionModal } from "./UnverifiedSuggestionModal";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

interface Evidence {
  snippet: string;
  source?: string;
  offset?: number;
}

interface OfferingBulleted {
  bullet: string;
  details: string;
  evidence: Evidence[];
}

interface SanitizedSocial {
  url: string | null;
  is_valid: boolean;
  note: string;
}

interface FieldWithConfidence {
  value: string;
  confidence: ConfidenceLevel;
  evidence: Evidence[];
}

interface CompanyData {
  name: string;
  url: string;
  industry: FieldWithConfidence;
  company_size: FieldWithConfidence;
  hq_location: FieldWithConfidence;
  usp: FieldWithConfidence;
  offerings?: Evidence[];
  offerings_bulleted?: OfferingBulleted[];
  target_audience: FieldWithConfidence;
  target_audience_list?: string[];
  contacts: {
    emails: string[];
    phones: string[];
    socials: {
      linkedin?: string | SanitizedSocial;
      twitter?: string | SanitizedSocial;
      facebook?: string | SanitizedSocial;
      instagram?: string | SanitizedSocial;
    };
  };
  analyzed_at: string;
}

interface IcpFit {
  score: number;
  status: string;
  rationale: string;
  subscores?: Record<string, number>;
}

interface CompanyCardProps {
  data: CompanyData;
  onReanalyze: () => void;
  icpFit?: IcpFit;
}

export const CompanyCard = ({ data, onReanalyze, icpFit }: CompanyCardProps) => {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [suggestionData, setSuggestionData] = useState<any>(null);
  const [loadingField, setLoadingField] = useState<string | null>(null);

  const handleSuggestUnverified = async (field: string) => {
    setLoadingField(field);
    try {
      const { data: funcData, error: funcError } = await supabase.functions.invoke('suggest-unverified', {
        body: { url: data.url, field }
      });

      if (funcError) throw funcError;

      if (!funcData.ok) {
        toast({
          title: "Unable to suggest",
          description: funcData.error?.message || "Field is already filled",
          variant: "destructive",
        });
        return;
      }

      setSuggestionData(funcData.data);
      setModalOpen(true);
    } catch (error) {
      console.error('Error getting suggestion:', error);
      toast({
        title: "Error",
        description: "Failed to generate suggestion",
        variant: "destructive",
      });
    } finally {
      setLoadingField(null);
    }
  };

  const shouldShowSuggestButton = (fieldValue: any, confidence?: ConfidenceLevel): boolean => {
    if (!fieldValue) return true;
    if (typeof fieldValue === 'object' && 'value' in fieldValue) {
      if (!fieldValue.value) return true;
    }
    if (Array.isArray(fieldValue) && fieldValue.length === 0) return true;
    return confidence === "low";
  };

  const getDomain = () => {
    try {
      return new URL(data.url).hostname;
    } catch {
      return undefined;
    }
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const socialIcons = {
    linkedin: Linkedin,
    twitter: Twitter,
    facebook: Facebook,
    instagram: Instagram,
  };

  const copySocialLink = (url: string | null, platform: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast({
      title: "Copied!",
      description: `${platform} link copied to clipboard`,
    });
  };

  const getSocialData = (social: string | SanitizedSocial | undefined): SanitizedSocial => {
    if (!social) return { url: null, is_valid: false, note: "missing" };
    if (typeof social === "string") return { url: social, is_valid: true, note: "ok" };
    return social;
  };

  return (
    <Card className="w-full max-w-4xl mx-auto shadow-card hover:shadow-card-hover transition-shadow animate-slide-up">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-foreground">{data.name}</h2>
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {data.url}
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          {icpFit && icpFit.status && (
            <FitBadge 
              score={icpFit.score} 
              status={icpFit.status} 
              rationale={icpFit.rationale}
              subscores={icpFit.subscores}
            />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Industry */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Industry</p>
                {shouldShowSuggestButton(data.industry, data.industry.confidence) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-xs"
                          onClick={() => handleSuggestUnverified('industry')}
                          disabled={loadingField === 'industry'}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Suggest (unverified)
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>AI guess. Not from this website.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className="text-base font-semibold">{data.industry.value || "Not available"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceBadge level={data.industry.confidence} />
            <EvidencePopover evidence={data.industry.evidence} />
          </div>
        </div>

        <Separator />

        {/* Company Size */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Company Size</p>
                {shouldShowSuggestButton(data.company_size, data.company_size.confidence) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-xs"
                          onClick={() => handleSuggestUnverified('company_size')}
                          disabled={loadingField === 'company_size'}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Suggest (unverified)
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>AI guess. Not from this website.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className="text-base font-semibold">{data.company_size.value || "Not available"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceBadge level={data.company_size.confidence} />
            <EvidencePopover evidence={data.company_size.evidence} />
          </div>
        </div>

        <Separator />

        {/* HQ Location */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">HQ Location</p>
                {shouldShowSuggestButton(data.hq_location, data.hq_location.confidence) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-xs"
                          onClick={() => handleSuggestUnverified('hq_location')}
                          disabled={loadingField === 'hq_location'}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Suggest (unverified)
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>AI guess. Not from this website.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className="text-base font-semibold">{data.hq_location.value || "Not available"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceBadge level={data.hq_location.confidence} />
            <EvidencePopover evidence={data.hq_location.evidence} />
          </div>
        </div>

        <Separator />

        {/* USP */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Unique Value Proposition</p>
                {shouldShowSuggestButton(data.usp, data.usp.confidence) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-xs"
                          onClick={() => handleSuggestUnverified('usp')}
                          disabled={loadingField === 'usp'}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Suggest (unverified)
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>AI guess. Not from this website.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className="text-base font-semibold mt-1">{data.usp.value || "Not available"}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <ConfidenceBadge level={data.usp.confidence} />
              <EvidencePopover evidence={data.usp.evidence} />
            </div>
          </div>
        </div>

        <Separator />

        {/* Offerings */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">Offerings / Services</p>
            {shouldShowSuggestButton(data.offerings_bulleted || data.offerings) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2 text-xs"
                      onClick={() => handleSuggestUnverified('offerings')}
                      disabled={loadingField === 'offerings'}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Suggest (unverified)
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>AI guess. Not from this website.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {data.offerings_bulleted && data.offerings_bulleted.length > 0 ? (
            <ul className="space-y-2">
              {data.offerings_bulleted.map((offering, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-base">• {offering.bullet}</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 px-1 text-muted-foreground hover:text-foreground">
                        <Info className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Details</h4>
                        <p className="text-sm text-muted-foreground">{offering.details}</p>
                        {offering.evidence.length > 0 && (
                          <>
                            <h4 className="font-semibold text-sm mt-3">Evidence</h4>
                            <div className="space-y-2">
                              {offering.evidence.map((ev, evidx) => (
                                <p key={evidx} className="text-sm text-muted-foreground italic border-l-2 border-primary pl-3">
                                  "{ev.snippet}"
                                </p>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </li>
              ))}
            </ul>
          ) : data.offerings && data.offerings.length > 0 ? (
            <ul className="list-disc list-inside space-y-1">
              {data.offerings.map((offering, idx) => (
                <li key={idx} className="text-base">{offering.snippet}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No details available.</p>
          )}
        </div>

        <Separator />

        {/* Target Audience */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Target Audience</p>
                {shouldShowSuggestButton(data.target_audience_list || data.target_audience, data.target_audience?.confidence) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-xs"
                          onClick={() => handleSuggestUnverified('target_audience')}
                          disabled={loadingField === 'target_audience'}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Suggest (unverified)
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>AI guess. Not from this website.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
            {data.target_audience && (
              <div className="flex items-center gap-2">
                <ConfidenceBadge level={data.target_audience.confidence} />
                <EvidencePopover evidence={data.target_audience.evidence} />
              </div>
            )}
          </div>
          {data.target_audience_list && data.target_audience_list.length > 0 ? (
            <ul className="list-disc list-inside space-y-1">
              {data.target_audience_list.map((audience, idx) => (
                <li key={idx} className="text-base">{audience}</li>
              ))}
            </ul>
          ) : data.target_audience?.value ? (
            <p className="text-base font-semibold">{data.target_audience.value}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No details available.</p>
          )}
        </div>

        <Separator />

        {/* Contacts */}
        <div className="space-y-4">
          <p className="text-sm font-medium text-muted-foreground">Contacts</p>
          
          {/* Emails */}
          {data.contacts.emails.length > 0 && (
            <div className="flex items-start gap-2">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-1">
                {data.contacts.emails.map((email, idx) => (
                  <a key={idx} href={`mailto:${email}`} className="block text-base text-primary hover:underline">
                    {email}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Phones */}
          {data.contacts.phones.length > 0 && (
            <div className="flex items-start gap-2">
              <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-1">
                {data.contacts.phones.map((phone, idx) => (
                  <a key={idx} href={`tel:${phone}`} className="block text-base text-primary hover:underline">
                    {phone}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Social Links */}
          {Object.keys(data.contacts.socials).length > 0 && (
            <TooltipProvider>
              <div className="flex items-center gap-3 flex-wrap">
                {Object.entries(data.contacts.socials).map(([platform, rawSocial]) => {
                  const Icon = socialIcons[platform as keyof typeof socialIcons];
                  const social = getSocialData(rawSocial);
                  const showLoginWarning = social.note === "may_require_login";
                  
                  return (
                    <div key={platform} className="flex items-center gap-1">
                      {social.is_valid && social.url ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={social.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                              <Icon className="h-4 w-4" />
                              {platform.charAt(0).toUpperCase() + platform.slice(1)}
                            </a>
                          </TooltipTrigger>
                          {showLoginWarning && (
                            <TooltipContent>
                              <p>May require login</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      ) : social.url ? (
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Icon className="h-4 w-4" />
                          {platform.charAt(0).toUpperCase() + platform.slice(1)}
                        </span>
                      ) : null}
                      {social.url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => copySocialLink(social.url, platform)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t pt-6">
        <p className="text-sm text-muted-foreground">
          Analyzed at {formatDate(data.analyzed_at)}
        </p>
        <Button onClick={onReanalyze} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Re-analyze
        </Button>
      </CardFooter>
      
      {/* Unverified Suggestion Modal */}
      <UnverifiedSuggestionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        data={suggestionData}
        companyName={data.name}
        domain={getDomain()}
      />
    </Card>
  );
};
