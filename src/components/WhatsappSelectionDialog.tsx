
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SuperAdmin, Employee } from "../types";
import { MessageCircle } from "lucide-react";

export function WhatsappSelectionDialog({
  isOpen,
  onClose,
  superAdmins,
  currentUser,
}: {
  isOpen: boolean;
  onClose: () => void;
  superAdmins: SuperAdmin[];
  currentUser: Employee | null;
}) {
  const handleChat = (admin: SuperAdmin) => {
    const message = encodeURIComponent(`Hallo kak ${admin.name}, aku ${currentUser?.name || "karyawan"} lupa password login Jenggo 1 app ku. Minta tolong dong di atur ulang password saya. Terima kasih kakak admin yg guanteng dan cuantikk.. `);
    window.open(`https://wa.me/${admin.whatsappNumber.replace(/\D/g, "")}?text=${message}`, "_blank");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-panel text-white border-white/20 sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-white text-center">Bantuan Reset Akses</DialogTitle>
          <DialogDescription className="text-white/60 text-center text-xs">
            Sistem kami memerlukan verifikasi manual untuk keamanan. Silakan pilih salah satu SuperAdmin di bawah ini untuk memulai chat WhatsApp, dan jelaskan kendala Anda agar Admin dapat memandu proses reset akses.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          {superAdmins.map((admin) => (
            <Button
              key={admin.id}
              onClick={() => handleChat(admin)}
              variant="outline"
              className="w-full justify-start gap-3 h-14 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl"
            >
              <MessageCircle className="w-5 h-5 text-emerald-400" />
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-bold">{admin.name}</span>
                <span className="text-[10px] text-white/50">{admin.whatsappNumber}</span>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
