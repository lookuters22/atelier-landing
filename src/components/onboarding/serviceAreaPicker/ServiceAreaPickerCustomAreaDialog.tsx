import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { customAreaToServiceArea } from "@/lib/serviceAreaPicker/serviceAreaSelectionHelpers.ts";
import type { BusinessScopeServiceArea } from "@/lib/serviceAreaPicker/serviceAreaPickerTypes.ts";
import { ServiceAreaPickerMapPreview } from "./ServiceAreaPickerMapPreview.tsx";

export type ServiceAreaPickerCustomAreaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLabel: string;
  onConfirm: (area: BusinessScopeServiceArea) => void;
};

export function ServiceAreaPickerCustomAreaDialog({
  open,
  onOpenChange,
  initialLabel,
  onConfirm,
}: ServiceAreaPickerCustomAreaDialogProps) {
  const [label, setLabel] = useState(initialLabel);
  const [pt, setPt] = useState<[number, number] | null>(null);

  const preview: BusinessScopeServiceArea[] =
    pt && label.trim()
      ? [
          {
            provider_id: "custom:preview",
            label: label.trim(),
            kind: "custom",
            provider: "custom",
            centroid: pt,
            bbox: [pt[0] - 0.08, pt[1] - 0.08, pt[0] + 0.08, pt[1] + 0.08],
            selected_at: new Date().toISOString(),
          },
        ]
      : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setPt(null);
          setLabel(initialLabel);
        }
      }}
    >
      <DialogContent className="border-white/15 bg-[#0f172a]/95 text-white sm:max-w-lg" variant="dashboard">
        <DialogHeader>
          <DialogTitle className="text-white">Custom service area</DialogTitle>
          <DialogDescription className="text-white/65">
            Name the area, then click the map once to place it.
          </DialogDescription>
        </DialogHeader>
        <input
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[14px] text-white placeholder:text-white/40"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Area name"
        />
        <div className="h-[200px] w-full overflow-hidden rounded-xl border border-white/15">
          <ServiceAreaPickerMapPreview
            selected={preview}
            onMapClick={({ lng, lat }) => setPt([lng, lat])}
            mapClickMode
            className="min-h-[200px] rounded-none border-0"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-white/25 bg-transparent text-white hover:bg-white/10"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-white/90 text-slate-900 hover:bg-white"
            disabled={!label.trim() || !pt}
            onClick={() => {
              const pad = 0.08;
              const area = customAreaToServiceArea(label.trim(), pt!, [
                pt![0] - pad,
                pt![1] - pad,
                pt![0] + pad,
                pt![1] + pad,
              ]);
              onConfirm(area);
              onOpenChange(false);
              setPt(null);
            }}
          >
            Add area
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
