import Controller from '@ember/controller';
import { restartableTask, timeout } from 'ember-concurrency';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class TrafficMeasureConceptsIndexController extends Controller {
  queryParams = ['page', 'size', 'code', 'template', 'sort'];

  @tracked page = 0;
  @tracked size = 30;
  @tracked code = '';
  @tracked template;
  @tracked sort = 'label';

  updateSearchFilterTask = restartableTask(
    async (queryParamProperty, event) => {
      await timeout(300);

      this[queryParamProperty] = event.target.value.trim();
      this.resetPagination();
    }
  );

  /**
   * @param {number} newPage
   */
  @action onPageChange(newPage) {
    this.page = newPage;
  }
  /** @param {string} newSort */
  @action onSortChange(newSort) {
    this.sort = newSort;
  }

  resetPagination() {
    this.page = 0;
  }
}
