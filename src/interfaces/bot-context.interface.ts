import { Context as TelegrafContext, Scenes } from 'telegraf';

export interface BotContext extends TelegrafContext {
  scene: Scenes.SceneContextScene<BotContext, Scenes.WizardSessionData>;
  wizard: Scenes.WizardContextWizard<BotContext>;
}
