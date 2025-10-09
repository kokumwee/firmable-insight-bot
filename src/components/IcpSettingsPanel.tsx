import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface IcpSettingsPanelProps {
  industries: string;
  size: string;
  continent: string;
  onIndustriesChange: (value: string) => void;
  onSizeChange: (value: string) => void;
  onContinentChange: (value: string) => void;
}

export const IcpSettingsPanel = ({
  industries,
  size,
  continent,
  onIndustriesChange,
  onSizeChange,
  onContinentChange,
}: IcpSettingsPanelProps) => {
  return (
    <Card className="max-w-2xl mx-auto mb-6">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <span>🎯</span> Ideal Customer Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="industries">Target industries (comma-separated)</Label>
          <Input
            id="industries"
            type="text"
            placeholder="e.g. fintech, gaming, logistics"
            value={industries}
            onChange={(e) => onIndustriesChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="size">Target company size</Label>
          <Select value={size} onValueChange={onSizeChange}>
            <SelectTrigger id="size">
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Any">Any</SelectItem>
              <SelectItem value="1–10 employees">1–10 employees</SelectItem>
              <SelectItem value="11–50 employees">11–50 employees</SelectItem>
              <SelectItem value="51–200 employees">51–200 employees</SelectItem>
              <SelectItem value="201–500 employees">201–500 employees</SelectItem>
              <SelectItem value="501–1000 employees">501–1000 employees</SelectItem>
              <SelectItem value="1001+ employees">1001+ employees</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="continent">Target continent</Label>
          <Select value={continent} onValueChange={onContinentChange}>
            <SelectTrigger id="continent">
              <SelectValue placeholder="Select continent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Any">Any</SelectItem>
              <SelectItem value="North America">North America</SelectItem>
              <SelectItem value="South America">South America</SelectItem>
              <SelectItem value="Europe">Europe</SelectItem>
              <SelectItem value="Asia">Asia</SelectItem>
              <SelectItem value="Africa">Africa</SelectItem>
              <SelectItem value="Oceania">Oceania</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground">
          Set your ideal customer profile — the app will rate each company's fit (0 – 5).
        </p>
      </CardContent>
    </Card>
  );
};
