/**
 * compiler.class.spec
 */
import express = require('express');
import request = require('supertest');

import { expect } from 'chai';
import { of, merge, Observable, Subscription } from 'rxjs';
import { mapTo, delay } from 'rxjs/operators';

import { GetMapping, PostMapping, PutMapping, PatchMapping, DeleteMapping } from '../../http/mappings';
import { Injector } from './injector.class';
import { LitModule, LitComponent, LitService } from '../..';
import { ServiceCompiler, LitCompiler } from './compiler.class';
import { HttpRequest, HttpResponse, HttpNext } from '../../http';
import { TestBed, LitComponentTest } from '../../testing';

describe('Class: Compiler', () => {

    let compiler: ServiceCompilerStub;

    class ServiceCompilerStub extends ServiceCompiler {

        port: string | number = '';
        meta: string = '';

        // we don't want to actually log anything
        // to the console in our spec
        // so we will mock this.console
        console = new class {
            logged: string[] = [];
            log(text: string): void {
                // ..
                this.logged.push(text);
            }
        };

        get exchange() {
            return request(this.app);
        }

        getPort() {
            return this.server.address().port;
        }

        setMeta(text: string) {
            this.meta = text;
        }
        
        closeServer() {
            if(this.server) {
                this.server.close();
            }
        }

        findRoutesByPath(path){

            path = '/' + path;
            return this.app._router.stack.filter(
                (item) => item.route &&
                          item.route.path === path
            ).map(
                (item) => {
                    return item.route;
                }
            );
        }

        getRoutePaths(): string[] {
            return this.app._router.stack.filter(
                (item) => item.route && item.route.path
            ).map(
                (item) => {
                    return item.route.path;
                }
            );
        }
    }

    beforeEach(() => {
        
        compiler = Injector.resolve(ServiceCompilerStub);
    });

    afterEach(() => {
        compiler.closeServer();
    });

    it('should allow setting a custom port', () => {
        
        @LitModule()
        class TestModule {

        }

        const testPort = 8080;
        
        compiler.bootstrap(TestModule, testPort);
        
        expect(compiler.getPort()).to.equal(testPort);
    });

    it('should start the application with a greeting', (done) => {
        
        @LitModule()
        class TestModule {

        }

        const testPort: number = 8080;
        const expectedGreeting: string = 'Application running on port ' + testPort;
        
        compiler.bootstrap(TestModule, testPort);

        const res = of(null);
        const emitter: Subscription = merge(
            res.pipe(mapTo(
                null
            ), delay(10))
        ).subscribe(
            res =>  {
                expect(compiler.console.logged[0]).to.equal(expectedGreeting);
                emitter.unsubscribe();
                done();
            }
        );
    });

    it('should add component exports', () => {

        @LitComponent()
        class TestComponent {

            @GetMapping({
                path: 'items'
            })
            getItems(req, res) {
                compiler.setMeta('test-input');
            }
        }
        
        @LitModule({
            exports: [
                TestComponent
            ]
        })
        class TestModule {}

        compiler.bootstrap(TestModule);

        const routes = compiler.findRoutesByPath('items');

        // a route should be found
        expect(routes.length).to.equal(1);

        // it should be a get request
        expect(routes[0].methods.get).to.be.true;

        // call the handler
        routes[0].stack[0].handle({}, {});

        expect(compiler.meta).to.equal('test-input');
    });

    it('should add module imports', () => {

        @LitComponent()
        class TestComponent {

            @PostMapping({
                path: 'items'
            })
            getItems(req, res) {}
        }
        
        @LitModule({
            exports: [
                TestComponent
            ]
        })
        class TestModule {}

        @LitModule({
            path: 'some',
            imports: [
                TestModule
            ]
        })
        class TestAppModule {}

        compiler.bootstrap(TestAppModule);

        const routes = compiler.findRoutesByPath('some/items');

        // a route should be found
        expect(routes.length).to.equal(1);

        // it should be a get request
        expect(routes[0].methods.post).to.be.true;
    });

    it('should only register routes with mapping decorators', () => {

        @LitComponent()
        class TestComponent {

            someUtil() {
                
            }
        }
        
        @LitModule({
            path: 'items',
            exports: [
                TestComponent
            ]
        })
        class TestModule {}

        compiler.bootstrap(TestModule);

        const routes = compiler.findRoutesByPath('items');

        expect(routes.length).to.equal(0);
    });

    it('should walk the entire import tree', () => {
        
        @LitComponent()
        class GrandChildComponent {

            @PutMapping({
                path: ':grandchild_id'
            })
            getGrand(req, res) {

            }
        }

        @LitComponent()
        class ChildComponent {
            
            @DeleteMapping()
            getChild(req, res) {
                
            }
        }

        @LitModule({
            path: 'grandchildren',
            exports: [
                GrandChildComponent
            ]
        })
        class GrandChildModule {
        }

        @LitModule({
            path: 'children',
            imports: [
                GrandChildModule
            ]
        })
        class ChildModule {
        }

        @LitModule({
            path: 'parents',
            imports: [
                ChildModule
            ],
            exports: [
                ChildComponent
            ]
        })
        class ParentModule {

        }

        @LitComponent()
        class TestComponent {

            @PostMapping()
            getTest(req, res) {}
        }

        @LitModule({
            exports: [
                TestComponent
            ],
            imports: [
                ParentModule
            ]
        })
        class TestModule {
        }

        const expectedRoutes: string[] = [ 
            '/',
            '/parents',
            '/parents/children/grandchildren/:grandchild_id'
        ];

        compiler.bootstrap(TestModule);

        expect(
            JSON.stringify(compiler.getRoutePaths())
        )
        .to.equal(
            JSON.stringify(expectedRoutes)
        );
    });

    it('should respond to http requests', function(done) {

        @LitComponent()
        class TestComponent {

            @GetMapping({
                path: ':id',
                produces: 'application/vnd.messages.v1+json'
            })
            getItem(req, res: HttpResponse) {
                res.success({
                    message: req.params.id
                });
            }
        }
        
        @LitModule({
            path: 'items',
            exports: [
                TestComponent
            ]
        })
        class TestModule {}

        const contentType: string = 'application/vnd.messages.v1+json; charset=utf-8';

        compiler.bootstrap(TestModule);

        compiler.exchange
                .get('/items/123')
                .expect('Content-Type', contentType)
                .expect(200)
                .expect((res) => {
                    expect(res.body.message).to.equal('123');
                })
                .end(function(err, res) {
                    if (err) return done(err);
                    done();
                });
    });

    it('should inject res if the handler has a single param', (done) => {

        @LitComponent()
        class TestComponent {

            @GetMapping()
            getItems(res: HttpResponse): void {
                res.success({ message: 'succeeded' });
            }
        }
        
        let component: LitComponentTest = TestBed.start(TestComponent);

        component
            .get('/')
            .expect(200)
            .expect((res) => {
                expect(res.body.message).to.equal('succeeded');
            })
            .end(function(err, res) {
                TestBed.stop();
                if (err) return done(err);
                done();
            });
    });

    it('should inject req and res if the handler has two params', (done) => {

        @LitComponent()
        class TestComponent {

            @GetMapping({
                path: ':id'
            })
            getItems(req: HttpRequest, res: HttpResponse): void {
                res.success({ message: req.params.id });
            }
        }
        
        let component: LitComponentTest = TestBed.start(TestComponent);

        component
            .get('/another-test')
            .expect(200)
            .expect((res) => {
                expect(res.body.message).to.equal('another-test');
            })
            .end(function(err, res) {
                TestBed.stop();
                if (err) return done(err);
                done();
            });
    });

    it('should inject req, res, and next if the handler has three params', (done) => {

        @LitComponent()
        class TestComponent {

            @GetMapping({
                path: ':id'
            })
            getItems(req: HttpRequest, res: HttpResponse, next: HttpNext): void {

                if(req.params.id === 'test') {
                    res.success({ message: req.params.id });
                    return;
                }
                
                next();
            }

            @GetMapping({
                path: ':id'
            })
            getItemsErr(res: HttpResponse): void {
                res.errored(404, { message: 'error' });
            }
        }
        
        let component: LitComponentTest = TestBed.start(TestComponent);

        component
            .get('/yet-another-test')
            .expect(404)
            .expect((res) => {
                expect(res.body.message).to.equal('error');
            })
            .end(function(err, res) {
                TestBed.stop();
                if (err) return done(err);
                done();
            });
    });

    it('should only handle the next route if next is called', (done) => {

        @LitComponent()
        class TestComponent {

            @GetMapping({
                path: ':id'
            })
            getItems(req: HttpRequest, res: HttpResponse, next: HttpNext): void {

                if(req.params.id === 'test') {
                    res.success({ message: req.params.id });
                    return;
                }
                
                next();
            }

            @GetMapping({
                path: ':id'
            })
            getItemsErr(res: HttpResponse): void {
                res.errored(404, { message: 'error' });
            }
        }
        
        
        let component: LitComponentTest = TestBed.start(TestComponent);

        component
            .get('/test')
            .expect(200)
            .expect((res) => {
                expect(res.body.message).to.equal('test');
            })
            .end(function(err, res) {
                TestBed.stop();
                if (err) return done(err);
                done();
            });
    });

    it('should return 404 if no params are defined', (done) => {

        @LitComponent()
        class TestComponent {

            @GetMapping({
                path: ':id'
            })
            getItems(): void {

                // I'm not really sure what they are doing here
                // but hey, someone will do it
                // we want to fail if this method is called
                // and instead send them to the default component
                // which will throw a 501 err
                expect(true).to.be.false;
            }
        }
        
        let component: LitComponentTest = TestBed.start(TestComponent);

        component
            .get('/test')
            .expect(501)
            .end(function(err, res) {
                TestBed.stop();
                if (err) return done(err);
                done();
            });
    });

    it('should inject dependencies', (done) => {

        @LitService()
        class TestService {
            message: string = 'test-val'
        }

        @LitComponent()
        class TestComponent {

            constructor(private testService: TestService) {
            }

            @GetMapping()
            getItems(res: HttpResponse) {
                res.success({
                    message: this.testService.message
                });
            }
        }

        let component: LitComponentTest = TestBed.start(TestComponent);

        component
            .get('/')
            .expect(200)
            .expect(res => {
                expect(res.body.message).to.equal('test-val');
            })
            .end(function(err, res) {
                TestBed.stop();
                if (err) return done(err);
                done();
            });
    });
});