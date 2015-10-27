(function () {
  'use strict';
  
  /**
   * @ngdoc overview
   * @name ui.grid.validate
   * @description
   *
   * # ui.grid.validate
   *
   * <div class="alert alert-warning" role="alert"><strong>Alpha</strong> This feature is in development. There will almost certainly be breaking api changes, or there are major outstanding bugs.</div>
   *
   * This module provides the ability to create subgrids with the ability to expand a row
   * to show the subgrid.
   *
   * Design information:
   * -------------------
   *
   * Validation is not based on angularjs validation, since it would work only when editing the field.
   * 
   * Instead it adds custom properties to any field considered as invalid.
   *
   * <br/>
   * <br/>
   *
   * <div doc-module-components="ui.grid.expandable"></div>
   */

  var module = angular.module('ui.grid.validate', ['ui.grid']);
  
  
  /**
   *  @ngdoc service
   *  @name ui.grid.validate.service:uiGridValidateService
   *
   *  @description Services for validation features
   */
  module.service('uiGridValidateService', ['$sce', '$q', '$http', 'i18nService', 'uiGridConstants', function ($sce, $q, $http, i18nService, uiGridConstants) {

    var service = {
    
      isInvalid: function (row, col) {
        return row.entity['$$invalid'+col.colDef.name];
      },

      setInvalid: function (rowEntity, colDef) {
        rowEntity['$$invalid'+colDef.name] = true;
      },
    
      setValid: function (rowEntity, colDef) {
        delete rowEntity['$$invalid'+colDef.name];
      },

      setError: function(rowEntity, colDef, validatorType) {
        if (typeof(rowEntity['$$errors'+colDef.name]) === 'undefined') {
          rowEntity['$$errors'+colDef.name] = {};
        }
        rowEntity['$$errors'+colDef.name][validatorType] = true;
      },

      clearError: function(rowEntity, colDef, validatorType) {
        if (typeof(rowEntity['$$errors'+colDef.name]) === 'undefined') {
          return;
        }
        if (validatorType in rowEntity['$$errors'+colDef.name]) {
            delete rowEntity['$$errors'+colDef.name][validatorType];
        }
      },
      
      getFormattedErrors: function(row, col) {

        var msgString = "";
        var errorMsg;

        if (!row.entity['$$errors'+col.colDef.name] || Object.keys(row.entity['$$errors'+col.colDef.name]).length === 0) {
          return;
        }

        Object.keys(row.entity['$$errors'+col.colDef.name]).sort().forEach(function(validatorType) {
          var validator = col.colDef.columnValidators[validatorType];
          errorMsg = validator.printError(validator.threshold);
          msgString += errorMsg + "<br/>";
        });

        return $sce.trustAsHtml('<p><b>' + i18nService.getSafeText('validate.error') + '</b></p>' + msgString );
      },

      getTitleFormattedErrors: function(row, col) {

        var newLine = "\n";

        var msgString = "";
        var errorMsg;

        if (!row.entity['$$errors'+col.colDef.name] || Object.keys(row.entity['$$errors'+col.colDef.name]).length === 0) {
          return;
        }

        Object.keys(row.entity['$$errors'+col.colDef.name]).sort().forEach(function(validatorType) {
          var validator = col.colDef.columnValidators[validatorType];
          errorMsg = validator.printError(validator.threshold);
          msgString += errorMsg + newLine;
        });

        return $sce.trustAsHtml(i18nService.getSafeText('validate.error') + newLine + msgString);
      },

      runValidators: function(rowEntity, colDef, newValue, oldValue) {
        
        if (typeof(colDef.name) === 'undefined' || !colDef.name) {
          throw new Error('colDef.name is required to perform validation');
        }
        
        service.setValid(rowEntity, colDef);

        if (newValue !== oldValue) {
          var validateClosureFactory = function(rowEntity, colDef, validatorType) {
            return function(value) {
              if (!value) {
                service.setInvalid(rowEntity, colDef);
                service.setError(rowEntity, colDef, validatorType);
              }
            };
          };

          for (var validatorType in colDef.columnValidators) {
            service.clearError(rowEntity, colDef, validatorType);
            var msg;
            var validator = colDef.columnValidators[validatorType];
            $q.when(validator.validate(validator.threshold, newValue, oldValue, rowEntity, colDef))
              .then(validateClosureFactory(rowEntity, colDef, validatorType)
            );
          }
        }
      },

      createDefaultValidators: function(grid) {
        
        var validateFnFactory = function(validatorType, validator) {
          var validateFn;
          switch (validatorType) {
            case 'minLength':
              validateFn = function(threshold, newValue, oldValue, rowEntity, colDef) {
                var minLength = validator.threshold;
                if (newValue.length < minLength) {
                  service.setInvalid(rowEntity, colDef);
                  service.setError(rowEntity, colDef, validatorType);
                  return false;
                }
                return true;
              };
              break;
            case 'maxLength':
              validateFn = function(threshold, newValue, oldValue, rowEntity, colDef) {
                var maxLength = validator.threshold;
                if (newValue.length > maxLength) {
                  service.setInvalid(rowEntity, colDef);
                  service.setError(rowEntity, colDef, validatorType); 
                  return false;
                }
                return true;
              };
              break;
            case 'notNull': 
              validateFn = function (threshold, newValue, oldValue, rowEntity, colDef) {
                return !(newValue === null || typeof(newValue) === 'undefined' || newValue === '');
              };
              break;
          }
          return validateFn;
        };
        
        var printErrorFnFactory = function(validatorType, validator) {
          var printErrorFn;
          
          printErrorFn = function(threshold) {
              return i18nService.getSafeText('validate.' + validatorType).replace('THRESHOLD', threshold);
            };
          
          return printErrorFn;
        };
        
        grid.options.columnDefs.forEach(function(colDef) {
          for (var validatorType in colDef.validators) {
            
            var validator = colDef.validators[validatorType];
            
            var validateFn = validateFnFactory(validatorType, validator);
            
            var printErrorFn = printErrorFnFactory(validatorType, validator);
            
            service.addColumnValidator(colDef, validatorType, validator.threshold, validateFn, printErrorFn);
          }
        });
      },

      /**
      * @ngdoc function
      * @name addColumnValidator
      * @methodOf  ui.grid.validate.service:uiGridValidateService
      * @description Helper function used to create a new column validator
      *
      * @param {colDef} column definition we want to add the validator to
      * @param {type} string, used to identify the validator
      * @param {threshold} object, represents the threshold value(s) for this validator
      * @param {validate} function(threshold, newValue, oldValue, rowEntity, colDef), 
      * must return true if validation is passed
      * @param {printError} function(threshold), must return an error message explaining
      * what validation error was thrown
      */
      addColumnValidator: function(colDef, type, threshold, validate, printError) {
        colDef.columnValidators[type] = {
          threshold: threshold,
          validate: validate,
          printError: printError
        };
      },

      initializeGrid: function (scope, grid) {
        grid.validate = {
        
          isInvalid: service.isInvalid,

          getFormattedErrors: service.getFormattedErrors,
         
          getTitleFormattedErrors: service.getTitleFormattedErrors,

          runValidators: service.runValidators
        };

        if (grid.edit) {
          grid.api.edit.on.afterCellEdit(scope,grid.validate.runValidators);
        }

        grid.options.columnDefs.forEach(function(colDef) {
          colDef.columnValidators = {};
        });

        service.createDefaultValidators(grid);
      }
      
    };
  
    return service;
  }]);
  
  module.directive('uiGridValidate', ['gridUtil', 'uiGridValidateService', function (gridUtil, uiGridValidateService) {
    return {
      priority: 0,
      replace: true,
      require: '^uiGrid',
      scope: false,
      compile: function () {
        return {
          pre: function ($scope, $elm, $attrs, uiGridCtrl) {
            uiGridValidateService.initializeGrid($scope, uiGridCtrl.grid);
          },
          post: function ($scope, $elm, $attrs, uiGridCtrl) {
          }
        };
      }
    };
  }]);
})();