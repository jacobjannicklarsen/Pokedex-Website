'use strict';
const {ExtensionStore}=require('./extension-store');
class Enhancements{
 constructor(repo,store=new ExtensionStore(repo.pool,repo)){this.repo=repo;this.store=store;this.settings=new(require('./account-settings').AccountSettings)(repo,store);this.social=new(require('./social').Social)(repo,store,this.settings);this.discovery=new(require('./community-discovery').Discovery)(repo,store,this.settings,this.social);this.polls=new(require('./forum-polls').Polls)(repo,store,this.social);this.battles=new(require('./saved-battles').SavedBattles)(repo,store);}
 securityVersion(id){return this.settings.securityVersion(id);}
 notifyPost(...args){return this.social.notifyPost(...args);}
 publicFields(...args){return this.settings.publicFields(...args);}
}
module.exports={Enhancements};
