import { useState } from "react";
import { ExternalLink, RefreshCw, MapPin, Users, Building2, Target, Mail, Phone, Linkedin, Twitter, Facebook, Instagram, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConfidenceBadge, ConfidenceLevel } from "./ConfidenceBadge";
import { EvidencePopover } from "./EvidencePopover";

interface Evidence {
  snippet: string;
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
  offerings: Evidence[];
  target_audience: FieldWithConfidence;
  contacts: {
    emails: string[];
    phones: string[];
    socials: {
      linkedin?: string;
      twitter?: string;
      facebook?: string;
      instagram?: string;
    };
  };
  analyzed_at: string;
}

interface CompanyCardProps {
  data: CompanyData;
  onReanalyze: () => void;
}

export const CompanyCard = ({ data, onReanalyze }: CompanyCardProps) => {
  const [isOfferingsExpanded, setIsOfferingsExpanded] = useState(false);
  const [isAudienceExpanded, setIsAudienceExpanded] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const socialIcons = {
    linkedin: Linkedin,
    twitter: Twitter,
    facebook: Facebook,
    instagram: Instagram,
  };

  return (
    <Card className="w-full max-w-4xl mx-auto shadow-card hover:shadow-card-hover transition-shadow animate-slide-up">
      <CardHeader className="space-y-4">
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
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Industry */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Industry</p>
              <p className="text-base font-semibold">{data.industry.value}</p>
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
              <p className="text-sm font-medium text-muted-foreground">Company Size</p>
              <p className="text-base font-semibold">{data.company_size.value}</p>
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
              <p className="text-sm font-medium text-muted-foreground">HQ Location</p>
              <p className="text-base font-semibold">{data.hq_location.value}</p>
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
              <p className="text-sm font-medium text-muted-foreground">Unique Value Proposition</p>
              <p className="text-base font-semibold mt-1">{data.usp.value}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <ConfidenceBadge level={data.usp.confidence} />
              <EvidencePopover evidence={data.usp.evidence} />
            </div>
          </div>
        </div>

        <Separator />

        {/* Offerings */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">💼 Offerings / Services</p>
            {data.offerings.length > 0 && (
              <button
                onClick={() => setIsOfferingsExpanded(!isOfferingsExpanded)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-all duration-200 hover:scale-[1.02]"
                aria-expanded={isOfferingsExpanded}
              >
                {isOfferingsExpanded ? "Collapse" : "View More"}
                <ChevronDown 
                  className={`h-3.5 w-3.5 transition-transform duration-200 ease-in-out ${isOfferingsExpanded ? "rotate-180" : ""}`} 
                />
              </button>
            )}
          </div>
          
          {data.offerings.length > 0 ? (
            <div className="relative">
              <div 
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  isOfferingsExpanded ? "max-h-[1000px] opacity-100" : "max-h-[140px] opacity-95"
                }`}
              >
                <ul className="list-disc list-inside space-y-1">
                  {(isOfferingsExpanded ? data.offerings : data.offerings.slice(0, 4)).map((offering, idx) => (
                    <li key={idx} className="text-base">{offering.snippet}</li>
                  ))}
                </ul>
              </div>
              
              {!isOfferingsExpanded && data.offerings.length > 4 && (
                <div 
                  className="absolute bottom-0 left-0 right-0 h-14 pointer-events-none rounded-b-lg"
                  style={{
                    background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 80%)"
                  }}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No details available.</p>
          )}
        </div>

        <Separator />

        {/* Target Audience */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">🎯 Target Audience</p>
            </div>
            <div className="flex items-center gap-2">
              <ConfidenceBadge level={data.target_audience.confidence} />
              <EvidencePopover evidence={data.target_audience.evidence} />
              {data.target_audience.value && data.target_audience.value.length > 200 && (
                <button
                  onClick={() => setIsAudienceExpanded(!isAudienceExpanded)}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-all duration-200 hover:scale-[1.02]"
                  aria-expanded={isAudienceExpanded}
                >
                  {isAudienceExpanded ? "Collapse" : "View More"}
                  <ChevronDown 
                    className={`h-3.5 w-3.5 transition-transform duration-200 ease-in-out ${isAudienceExpanded ? "rotate-180" : ""}`} 
                  />
                </button>
              )}
            </div>
          </div>

          {data.target_audience.value ? (
            <div className="relative">
              <div 
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  isAudienceExpanded ? "max-h-[1000px] opacity-100" : "max-h-[140px] opacity-95"
                }`}
              >
                {isAudienceExpanded && /[,;]/.test(data.target_audience.value) ? (
                  <div className="flex flex-wrap gap-2">
                    {data.target_audience.value.split(/[,;]/).map((item, idx) => (
                      <span 
                        key={idx} 
                        className="px-3 py-1.5 text-xs font-medium bg-muted text-foreground rounded-full"
                      >
                        {item.trim()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-base leading-relaxed">
                    {isAudienceExpanded 
                      ? data.target_audience.value 
                      : data.target_audience.value.slice(0, 200) + (data.target_audience.value.length > 200 ? "..." : "")}
                  </p>
                )}
              </div>
              
              {!isAudienceExpanded && data.target_audience.value.length > 200 && (
                <div 
                  className="absolute bottom-0 left-0 right-0 h-14 pointer-events-none rounded-b-lg"
                  style={{
                    background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 80%)"
                  }}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No details available.</p>
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
            <div className="flex items-center gap-3 flex-wrap">
              {Object.entries(data.contacts.socials).map(([platform, url]) => {
                const Icon = socialIcons[platform as keyof typeof socialIcons];
                return (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Icon className="h-4 w-4" />
                    {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </a>
                );
              })}
            </div>
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
    </Card>
  );
};
