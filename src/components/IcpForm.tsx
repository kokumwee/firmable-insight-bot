import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Save, RotateCcw } from "lucide-react";

interface IcpData {
  industries: string[];
  size: string;
  regions: string[];
  audience: string;
  offering_keywords: string;
  weights: {
    industry: number;
    size: number;
    region: number;
    audience: number;
    offerings: number;
  };
}

interface IcpFormProps {
  icp: IcpData;
  onUpdate: (icp: IcpData) => void;
  onSave: () => void;
  onReset: () => void;
  isSaving: boolean;
}

export const IcpForm = ({ icp, onUpdate, onSave, onReset, isSaving }: IcpFormProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleIndustriesChange = (value: string) => {
    const industries = value.split(",").map(s => s.trim()).filter(Boolean);
    onUpdate({ ...icp, industries });
  };

  const handleRegionsChange = (value: string) => {
    const regions = value.split(",").map(s => s.trim()).filter(Boolean);
    onUpdate({ ...icp, regions });
  };

  const handleWeightChange = (key: keyof typeof icp.weights, value: number[]) => {
    onUpdate({ 
      ...icp, 
      weights: { ...icp.weights, [key]: value[0] } 
    });
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="cursor-pointer">
          <CollapsibleTrigger className="flex items-center justify-between w-full">
            <CardTitle className="text-xl">Ideal Customer Profile</CardTitle>
            {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </CollapsibleTrigger>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Industries */}
            <div className="space-y-2">
              <Label htmlFor="industries">Industries (comma-separated)</Label>
              <Input
                id="industries"
                placeholder="e.g., SaaS, Fintech, Payments"
                value={icp.industries.join(", ")}
                onChange={(e) => handleIndustriesChange(e.target.value)}
              />
            </div>

            {/* Company Size */}
            <div className="space-y-2">
              <Label htmlFor="size">Company Size</Label>
              <Select value={icp.size} onValueChange={(value) => onUpdate({ ...icp, size: value })}>
                <SelectTrigger id="size">
                  <SelectValue placeholder="Select company size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1–10">1–10</SelectItem>
                  <SelectItem value="11–50">11–50</SelectItem>
                  <SelectItem value="51–200">51–200</SelectItem>
                  <SelectItem value="201–1000">201–1000</SelectItem>
                  <SelectItem value="1000+">1000+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Regions */}
            <div className="space-y-2">
              <Label htmlFor="regions">Regions (comma-separated)</Label>
              <Input
                id="regions"
                placeholder="e.g., AU/NZ, US, EU, APAC"
                value={icp.regions.join(", ")}
                onChange={(e) => handleRegionsChange(e.target.value)}
              />
            </div>

            {/* Audience */}
            <div className="space-y-2">
              <Label htmlFor="audience">Target Audience / Buyer</Label>
              <Input
                id="audience"
                placeholder="e.g., B2B SaaS, finance teams, online retailers"
                value={icp.audience}
                onChange={(e) => onUpdate({ ...icp, audience: e.target.value })}
              />
            </div>

            {/* Offerings Keywords */}
            <div className="space-y-2">
              <Label htmlFor="offerings">Offerings Keywords (comma-separated)</Label>
              <Input
                id="offerings"
                placeholder="e.g., billing, checkout, subscriptions"
                value={icp.offering_keywords}
                onChange={(e) => onUpdate({ ...icp, offering_keywords: e.target.value })}
              />
            </div>

            {/* Weight Sliders */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-medium">Importance Weights (0–3)</h3>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="weight-industry" className="text-sm">Industry</Label>
                    <span className="text-sm text-muted-foreground">{icp.weights.industry}</span>
                  </div>
                  <Slider
                    id="weight-industry"
                    min={0}
                    max={3}
                    step={1}
                    value={[icp.weights.industry]}
                    onValueChange={(value) => handleWeightChange('industry', value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="weight-size" className="text-sm">Company Size</Label>
                    <span className="text-sm text-muted-foreground">{icp.weights.size}</span>
                  </div>
                  <Slider
                    id="weight-size"
                    min={0}
                    max={3}
                    step={1}
                    value={[icp.weights.size]}
                    onValueChange={(value) => handleWeightChange('size', value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="weight-region" className="text-sm">Region</Label>
                    <span className="text-sm text-muted-foreground">{icp.weights.region}</span>
                  </div>
                  <Slider
                    id="weight-region"
                    min={0}
                    max={3}
                    step={1}
                    value={[icp.weights.region]}
                    onValueChange={(value) => handleWeightChange('region', value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="weight-audience" className="text-sm">Audience</Label>
                    <span className="text-sm text-muted-foreground">{icp.weights.audience}</span>
                  </div>
                  <Slider
                    id="weight-audience"
                    min={0}
                    max={3}
                    step={1}
                    value={[icp.weights.audience]}
                    onValueChange={(value) => handleWeightChange('audience', value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="weight-offerings" className="text-sm">Offerings</Label>
                    <span className="text-sm text-muted-foreground">{icp.weights.offerings}</span>
                  </div>
                  <Slider
                    id="weight-offerings"
                    min={0}
                    max={3}
                    step={1}
                    value={[icp.weights.offerings]}
                    onValueChange={(value) => handleWeightChange('offerings', value)}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button onClick={onSave} disabled={isSaving} className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                Save ICP
              </Button>
              <Button variant="outline" onClick={onReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
