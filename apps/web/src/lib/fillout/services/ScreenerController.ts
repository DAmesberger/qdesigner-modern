import type { VariableEngine } from '@qdesigner/scripting-engine';
import type { ScreenerBlock, ScreenerRule } from '$lib/shared/types/questionnaire';

/**
 * Structured screen-out outcome (E-FLOW-7). Distinct from an over-quota block:
 * a screen-out is an eligibility decision (out of the target population), routed
 * to the `ineligible` completion state with its own reason/redirect. Over-quota
 * is a capacity decision routed to `over-quota` (see QuotaService.checkCells).
 */
export interface ScreenOutResult {
	/** True when the participant is eligible (no rule failed). */
	eligible: boolean;
	/** The rule that screened the participant out (only when `eligible === false`). */
	rule?: ScreenerRule;
	/**
	 * Id of the rule that screened the participant out. Set directly on the
	 * flow-`terminate` screen-out path (whose rule is a {@link FlowControl}, not a
	 * {@link ScreenerRule}); otherwise derived from `rule.id`.
	 */
	ruleId?: string;
	/** Machine-readable reason, recorded to `session.metadata.screenOut.reason`. */
	reason?: string;
	/** Participant-facing message. */
	message?: string;
	/** Redirect distinct from the over-quota redirect. */
	redirectUrl?: string;
}

/**
 * Evaluates structured eligibility screeners against live in-survey variables
 * via the runtime {@link VariableEngine}. Screener rules run at a page boundary
 * (their `pageId`); the FIRST rule whose `eligibleWhen` formula evaluates falsy
 * screens the participant out with that rule's structured reason.
 *
 * The controller is pure/stateless w.r.t. the questionnaire; it reads eligibility
 * off the engine each time so a re-check after later demographic questions
 * reflects the newest answers.
 */
export class ScreenerController {
	private readonly screeners: ScreenerBlock[];
	private readonly engine: VariableEngine;

	constructor(screeners: ScreenerBlock[] | undefined, engine: VariableEngine) {
		this.screeners = screeners ?? [];
		this.engine = engine;
	}

	/** Are any screeners configured at all? */
	get hasScreeners(): boolean {
		return this.screeners.some((s) => s.rules.length > 0);
	}

	/** The page ids at which eligibility must be (re-)evaluated. */
	get screenerPageIds(): string[] {
		return this.screeners.filter((s) => s.rules.length > 0).map((s) => s.pageId);
	}

	/**
	 * Evaluate all rules of every screener attached to `pageId`. Returns the
	 * first screen-out, or `{ eligible: true }` when every rule passes.
	 *
	 * A rule's `eligibleWhen` formula that throws (bad formula / missing variable)
	 * is treated as INELIGIBLE-inconclusive → we DO NOT screen out on an engine
	 * error (fail-open on evaluation error, so a broken formula never wrongly
	 * rejects real participants); it is logged for the designer.
	 */
	evaluateAtPage(pageId: string): ScreenOutResult {
		for (const screener of this.screeners) {
			if (screener.pageId !== pageId) continue;
			for (const rule of screener.rules) {
				let eligible: boolean;
				try {
					eligible = this.engine.evaluateCondition(rule.eligibleWhen);
				} catch (err) {
					console.warn(
						`[ScreenerController] rule "${rule.id}" formula failed; treating as eligible:`,
						err
					);
					eligible = true;
				}
				if (!eligible) {
					return {
						eligible: false,
						rule,
						reason: rule.screenOutReason,
						message: rule.screenOutMessage,
						redirectUrl: rule.screenOutRedirectUrl,
					};
				}
			}
		}
		return { eligible: true };
	}

	/**
	 * Evaluate EVERY screener regardless of page (entry-time full sweep). Used to
	 * gate a pre-survey screener where all eligibility is known up front (e.g.
	 * from URL params). Returns the first screen-out.
	 */
	evaluateAll(): ScreenOutResult {
		for (const screener of this.screeners) {
			const result = this.evaluateAtPage(screener.pageId);
			if (!result.eligible) return result;
		}
		return { eligible: true };
	}

	/**
	 * Build the structured `metadata.screenOut` blob recorded onto the session
	 * when a participant is screened out, so ineligibility is queryable server-side.
	 * The participant-facing message + redirect ride along so the completion view
	 * can render the screen from persisted metadata (e.g. on a resumed session).
	 */
	static metadataFor(result: ScreenOutResult): {
		screenOut: {
			reason: string;
			ruleId: string | null;
			message?: string;
			redirectUrl?: string;
			at: string;
		};
	} {
		return {
			screenOut: {
				reason: result.reason ?? 'ineligible',
				ruleId: result.ruleId ?? result.rule?.id ?? null,
				...(result.message ? { message: result.message } : {}),
				...(result.redirectUrl ? { redirectUrl: result.redirectUrl } : {}),
				at: new Date().toISOString(),
			},
		};
	}
}
