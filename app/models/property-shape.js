import { belongsTo } from '@ember-data/model';
import ShapeModel from './shape';

export default class PropertyShapeModel extends ShapeModel {
  @belongsTo('resource') path;
}
