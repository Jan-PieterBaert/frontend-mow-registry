import Component from '@glimmer/component';
import { task } from 'ember-concurrency';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class TrafficMeasureIndexComponent extends Component {
  constructor(...args) {
    super(...args);

    this.trafficMeasureConcept = this.args.trafficMeasureConcept;
    this.new = this.args.new;
    this.fetchData.perform();
  }

  @service store;
  @service router;

  @tracked new;
  @tracked trafficMeasureConcept;
  @tracked signs = [];
  @tracked mappings = [];
  @tracked template;
  @tracked searchString;
  @tracked signError;
  @tracked preview;
  @tracked model;
  @tracked selectedType;
  @tracked inputTypes = ['text', 'number', 'date', 'location', 'codelist'];

  get label() {
    let result = '';

    this.signs.forEach((e) => {
      if (e.get('roadSignConceptCode'))
        result = `${result}${e.get('roadSignConceptCode')}-`;
      else if (e.get('roadMarkingConceptCode'))
        result = `${result}${e.get('roadMarkingConceptCode')}-`;
      else if (e.get('trafficLightConceptCode'))
        result = `${result}${e.get('trafficLightConceptCode')}-`;
    });

    result = result.slice(0, -1);
    return `${result} Traffic Measure`;
  }

  get isSelectedTypeEmpty() {
    return !this.selectedType;
  }

  @task
  *fetchData() {
    // Wait for data loading
    yield this.trafficMeasureConcept.relations;

    // We assume that a measure has only one template
    const templates = yield this.trafficMeasureConcept.templates;
    this.template = yield templates.firstObject;
    this.mappings = yield this.template.get('mappings');

    const relations = yield this.trafficMeasureConcept.orderedRelations;
    this.signs = yield Promise.all(
      relations.map((relation) => relation.get('concept'))
    );

    this.parseTemplate();
  }

  @action
  addSign(sign) {
    this.signs.pushObject(sign);
    this.selectedType = null;
  }

  @action
  removeSign(sign) {
    this.signs.removeObject(sign);
  }

  @action
  updateTemplate(event) {
    this.template.value = event.target.value;
  }

  //parsing algo that keeps ui changes in tact
  @action
  parseTemplate() {
    //finds non-whitespase characters between ${ and }
    const regex = new RegExp(/\${(\S+?)}/g);
    const regexResult = [...this.template.value.matchAll(regex)];

    //remove duplicates from regex result
    const filteredRegexResult = [];
    regexResult.forEach((reg) => {
      if (!filteredRegexResult.find((fReg) => fReg[0] === reg[0])) {
        filteredRegexResult.push(reg);
      }
    });

    //remove non-existing variable mappings from current array
    this.mappings = this.mappings.filter((mapping) => {
      return filteredRegexResult.find((fReg) => fReg[1] === mapping.variable);
    });

    //add new variable mappings
    filteredRegexResult.forEach((reg) => {
      if (!this.mappings.find((mapping) => mapping.variable === reg[1])) {
        this.mappings.pushObject(
          this.store.createRecord('mapping', {
            variable: reg[1],
            type: 'text',
            expects: this.nodeShape,
          })
        );
      }
    });

    //remove duplicates in case something went wrong
    const filteredMappings = [];
    this.mappings.forEach((mapping) => {
      if (
        !filteredMappings.find(
          (fMapping) => fMapping.variable === mapping.variable
        )
      ) {
        filteredMappings.push(mapping);
      }
    });
    this.mappings = filteredMappings;

    this.generatePreview();
  }

  @action
  generatePreview() {
    this.preview = this.template.value;
    this.mappings.forEach((e) => {
      let replaceString;
      if (e.type === 'text') {
        replaceString = "<input type='text'></input>";
      } else if (e.type === 'number') {
        replaceString = "<input type='number'></input>";
      } else if (e.type === 'date') {
        replaceString = "<input type='date'></input>";
      } else if (e.type === 'location') {
        replaceString = "<input type='text'></input>";
      } else if (e.type === 'codelist') {
        replaceString = "<input type='text'></input>";
      }
      this.preview = this.preview.replaceAll(
        '${' + e.variable + '}',
        replaceString
      );
    });
    this.generateModel();
  }

  @task
  *delete() {
    const nodeShape = yield this.store.query('node-shape', {
      'filter[targetHasConcept][id]': this.trafficMeasureConcept.id,
    });
    yield (yield nodeShape.firstObject).destroyRecord();

    // We assume a measure only has one template
    yield (yield (yield this.trafficMeasureConcept.get('templates')
      .firstObject).get('mappings')).forEach((mapping) =>
      mapping.destroyRecord()
    );
    yield (yield this.trafficMeasureConcept.get('templates')
      .firstObject).destroyRecord();
    yield (yield this.trafficMeasureConcept.get(
      'relations'
    )).forEach((relation) => relation.destroyRecord());

    yield this.trafficMeasureConcept.destroyRecord();
    this.router.transitionTo('traffic-measure-concepts.index');
  }

  @task
  *save() {
    // We assume a measure only has one template
    const template = yield this.trafficMeasureConcept.templates.firstObject;

    //if new save relationships
    if (this.new) {
      yield template.save();
      yield this.trafficMeasureConcept.save();
    }

    //1-parse everything again
    this.parseTemplate();

    //2-update node shape
    this.trafficMeasureConcept.label = this.label;
    yield this.trafficMeasureConcept.save();

    //3-update roadsigns
    yield this.saveRoadsigns.perform(this.trafficMeasureConcept);

    //4-handle variable mappings
    yield this.saveMappings.perform(template);

    if (this.new) {
      this.router.transitionTo(
        'traffic-measure-concepts.edit',
        this.trafficMeasureConcept.id
      );
    }
  }

  @task
  *saveRoadsigns(trafficMeasureConcept) {
    // delete existing ones
    for (let i = 0; i < trafficMeasureConcept.relations.length; i++) {
      const relation = trafficMeasureConcept.relations.objectAt(0);
      yield relation.destroyRecord();
    }
    // creating signs
    trafficMeasureConcept.relations = [];
    for (let i = 0; i < this.signs.length; i++) {
      const mustUseRelation = this.store.createRecord('must-use-relation');
      mustUseRelation.concept = this.signs[i];
      mustUseRelation.order = i;
      trafficMeasureConcept.relations.pushObject(mustUseRelation);
      yield mustUseRelation.save();
    }
    yield trafficMeasureConcept.save();
  }

  @task
  *saveMappings(template) {
    const mappings = yield template.mappings;
    //delete existing ones
    for (let i = 0; i < mappings.length; i++) {
      const mapping = mappings.objectAt(0);
      yield mapping.destroyRecord();
    }
    //create new ones
    for (let i = 0; i < this.mappings.length; i++) {
      const mapping = this.mappings[i];
      const newMapping = yield this.store.createRecord('mapping');
      newMapping.variable = mapping.variable;
      newMapping.type = mapping.type;
      template.mappings.pushObject(newMapping);
      yield newMapping.save();
    }
    yield template.save();
  }

  @action
  generateModel() {
    const templateUUid = this.trafficMeasureConcept.id;
    this.model =
      `
    PREFIX ex: <http://example.org#>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX oslo: <http://data.vlaanderen.be/ns#>

    INSERT {
    GRAPH <http://mu.semte.ch/application>{
    
    ex:` +
      templateUUid +
      ` a ex:TrafficMeasureTemplate ;
      ex:value "` +
      this.template.value +
      `";
      ex:mapping
    `;

    let varString = '';
    this.mappings.forEach((mapping) => {
      varString +=
        `
        [
          ex:variable "` +
        mapping.variable +
        `" ;
          ex:expects [
            a sh:PropertyShape ;
              sh:targetClass ex:` +
        mapping.type +
        ` ;
              sh:maxCount 1 ;
          ]
        ],`;
    });
    varString = varString.slice(0, -1) + '.';

    let signString = '';
    let signIdentifier = '';

    this.signs.forEach((sign) => {
      signIdentifier += sign.get('roadSignConceptCode') + '-';
      signString +=
        `
        [
          a ex:MustUseRelation ;
          ex:signConcept <http://data.vlaanderen.be/id/concept/Verkeersbordconcept/` +
        sign.get('id') +
        `> 
        ],`;
    });

    signString = signString.slice(0, -1);
    signIdentifier = signIdentifier.slice(0, -1);

    this.model +=
      varString +
      `

      ex:Shape#TrafficMeasure a sh:NodeShape;
        sh:targetClass oslo:Verkeersmaatregel;
        ex:targetHasConcept ex:` +
      signIdentifier +
      `MeasureConcept .
        
      ex:` +
      signIdentifier +
      `MeasureConcept a ex:Concept ;
        ex:label "` +
      signIdentifier +
      ` traffic measure";
        ex:template ex:` +
      templateUUid +
      ` ;
        ex:relation `;
    this.model +=
      signString +
      `.
    }}
    `;
  }

  @action
  updateTypeFilter(selectedType) {
    if (selectedType) {
      this.selectedType = selectedType;
    } else {
      this.selectedType = null;
    }
  }

  @action
  addInstructionToTemplate(instruction) {
    this.template.value += `${instruction.value} `;
    this.parseTemplate();
  }

  @action
  updateMappingType(mapping, selectedType) {
    mapping.type = selectedType;
    this.parseTemplate();
  }
}