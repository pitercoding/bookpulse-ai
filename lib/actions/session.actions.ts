"use server";

import { EndSessionResult, StartSessionResult } from "@/types";
import VoiceSession from "@/database/models/voice-session.model";
import { connectToDatabase } from "@/database/mongoose";
import { getCurrentBillingPeriodStart } from "../subscription-constants";

export const startVoiceSession = async (clerkId: string, bookId: string): Promise<StartSessionResult> => {
    try {
        await connectToDatabase();

        // Limits/Plan to see whether a session is allowed.

        const session = await VoiceSession.create({
            clerkId, 
            bookId, 
            startedAt: new Date(),
            billingPeriodStart: getCurrentBillingPeriodStart(),
            durationSeconds: 0,
        });

        return {
            success: true,
            sessionId: session._id.toString(),
            // maxDurationMinutes: check.maxDurationMinutes,
        }
    } catch (e) {
        console.error('Error starting voice session', e);
        return { success: false, error: 'Failed to start voice session. Please try again later' }
    }
}

export const endVoiceSession = async (
    sessionId: string,
    durationSeconds: number
): Promise<EndSessionResult> => {
    try {
        await connectToDatabase();

        const session = await VoiceSession.findByIdAndUpdate(
            sessionId,
            {
                endedAt: new Date(),
                durationSeconds,
            },
            { new: true }
        );

        if (!session) {
            return { success: false, error: 'Voice session not found' };
        }

        return { success: true };
    } catch (e) {
        console.error('Error ending voice session', e);
        return { success: false, error: 'Failed to end voice session. Please, try again later.' };
    }
}
