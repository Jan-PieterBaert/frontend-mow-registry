import Service from '@ember/service';
import { task } from 'ember-concurrency';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class CodelistsService extends Service {
  @tracked codeLists = null;

  @service store;

  all = task(async () => {
    if (!this.codeLists) {
      const codeLists = await this.store.query('code-list', {
        'page[size]': 100,
        include: 'concepts',
        sort: 'label',
      });
      await Promise.all(codeLists.map((codeList) => codeList.concepts));

      this.codeLists = codeLists;
    }
    return this.codeLists;
  });
}
