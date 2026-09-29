import { useEffect, useState } from "react";

import { Label } from "@radix-ui/react-label";
import { motion } from "motion/react";

import { FADE_IN_ANIMATION_SETTINGS } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { Textarea } from "@/components/ui/textarea";

import { DEFAULT_LINK_TYPE } from ".";
import LinkItem from "./link-item";

const MAX_WELCOME_MESSAGE_LENGTH = 80;
const MAX_WELCOME_DESCRIPTION_LENGTH = 500;

export function WelcomeMessageSection({
  data,
  setData,
}: {
  data: DEFAULT_LINK_TYPE;
  setData: React.Dispatch<React.SetStateAction<DEFAULT_LINK_TYPE>>;
}) {
  const { welcomeMessage, welcomeDescription } = data;
  const [enabled, setEnabled] = useState<boolean>(
    !!welcomeMessage || !!welcomeDescription,
  );
  const [welcomeMessageError, setWelcomeMessageError] = useState<
    string | null
  >(null);

  useEffect(() => {
    setEnabled(!!welcomeMessage || !!welcomeDescription);
  }, [welcomeMessage, welcomeDescription]);

  const handleWelcomeMessageToggle = () => {
    const updatedEnabled = !enabled;
    setEnabled(updatedEnabled);
    
    if (!updatedEnabled) {
      // Clear the welcome message and description when disabled
      setData({ ...data, welcomeMessage: null, welcomeDescription: null });
      setWelcomeMessageError(null);
    }
  };

  const validateWelcomeMessage = (message: string): boolean => {
    if (message.length > MAX_WELCOME_MESSAGE_LENGTH) {
      setWelcomeMessageError(
        `Message is too long. Maximum ${MAX_WELCOME_MESSAGE_LENGTH} characters allowed.`,
      );
      return false;
    }
    setWelcomeMessageError(null);
    return true;
  };

  const handleWelcomeMessageChange = (message: string) => {
    validateWelcomeMessage(message);
    setData({ ...data, welcomeMessage: message || null });
  };

  return (
    <div className="pb-5">
      <LinkItem
        title="Custom Welcome Message"
        tooltipContent="Override the default welcome message for this link and add a description shown above the email field"
        enabled={enabled}
        action={handleWelcomeMessageToggle}
      />

      {enabled && (
        <motion.div
          className="relative mt-4 space-y-3"
          {...FADE_IN_ANIMATION_SETTINGS}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="welcome-message">
                <p className="block text-sm font-medium text-foreground">
                  Welcome Message
                </p>
              </Label>
              <span className="text-sm text-muted-foreground">
                <span className={cn(welcomeMessageError && "text-red-500")}>
                  {welcomeMessage?.length || 0}
                </span>
                /{MAX_WELCOME_MESSAGE_LENGTH}
              </span>
            </div>
            <Textarea
              id="welcome-message"
              value={welcomeMessage || ""}
              onChange={(e) => handleWelcomeMessageChange(e.target.value)}
              placeholder="Your action is requested to continue"
              className={cn(
                "min-h-24 resize-none",
                welcomeMessageError &&
                  "border-red-500 focus:border-red-500 focus:ring-red-500",
              )}
              maxLength={MAX_WELCOME_MESSAGE_LENGTH}
            />
            {welcomeMessageError && (
              <p className="text-xs text-red-500">{welcomeMessageError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              This message will override the default welcome message from your
              branding settings for this specific link.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="welcome-description">
                <p className="block text-sm font-medium text-foreground">
                  Description{" "}
                  <span className="text-sm italic text-muted-foreground">
                    (optional)
                  </span>
                </p>
              </Label>
              <span className="text-sm text-muted-foreground">
                {welcomeDescription?.length || 0}/
                {MAX_WELCOME_DESCRIPTION_LENGTH}
              </span>
            </div>
            <Textarea
              id="welcome-description"
              value={welcomeDescription || ""}
              onChange={(e) =>
                setData({ ...data, welcomeDescription: e.target.value || null })
              }
              placeholder="Tell visitors what they're about to see before they enter their email."
              className="min-h-28 resize-y"
              maxLength={MAX_WELCOME_DESCRIPTION_LENGTH}
            />
            <p className="text-xs text-muted-foreground">
              Shown under the welcome message on the access page, above the
              email field. Line breaks are kept.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

